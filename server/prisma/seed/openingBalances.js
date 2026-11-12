// prisma/seed/openingBalances.js
// CR-04a CP2 · FR-44 · BR-23 — bahan baku seed + saldo awal dengan preflight (Errata E1.1 §2 – §3).
// 1. preflightMaterials: HANYA membaca (satu snapshot), sebelum seed menulis apa pun. Bahan diproses = bahan seed ∪
//    semua raw_materials yang ada; klasifikasi K-A (belum ada) · K-B (saldo awal sah, tidak diubah) · K-C (tanpa
//    catatan stok → saldo awal dari stok saat ini) · K-D (tidak konsisten → seed berhenti sebelum penulisan pertama).
// 2. applyMaterialPlan: satu transaksi per bahan K-A/K-C. Di awal transaksi baris bahan dikunci (FOR UPDATE) dan
//    klasifikasi diperiksa ulang; berbeda dari preflight → transaksi itu rollback dan seed berhenti (jalankan ulang).
// Seed tidak pernah UPDATE raw_materials.stock dan tidak membuat mutasi selain saldo awal → idempoten; gangguan di tengah
// aman dilanjutkan dengan seed ulang (bahan yang sudah COMMIT menjadi K-B).

const { Prisma } = require('@prisma/client');
const { loadLedgerMaterials } = require('../../src/services/ledgerData.service');
const { classifyMaterialForSeed } = require('../../src/services/ledgerRules.service');
const { createOpeningBalance } = require('../../src/services/openingBalance.service');

class SeedPreflightError extends Error {}
class SeedDataChangedError extends Error {}

const READ_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000, maxWait: 10000 };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{materialId: number, name: string, unit: string, stock: number|string, minStock: number|string}[]} seedMaterials
 */
async function preflightMaterials(prisma, seedMaterials) {
  const existing = await prisma.$transaction((tx) => loadLedgerMaterials(tx), READ_OPTIONS);
  const byId = new Map(existing.map((m) => [m.materialId, m]));
  const plan = { create: [], repair: [], keep: [], blocked: [] };
  for (const row of seedMaterials) {
    if (!byId.has(String(row.materialId))) plan.create.push(row);
  }
  for (const material of existing) {
    const { kind, reasons } = classifyMaterialForSeed(material);
    if (kind === 'K-B') plan.keep.push(material.materialId);
    else if (kind === 'K-C') plan.repair.push(material.materialId);
    else plan.blocked.push({ materialId: material.materialId, name: material.name, reasons });
  }
  return plan;
}

function assertPlanWritable(plan) {
  if (!plan.blocked.length) return;
  const detail = plan.blocked.map((b) => `  - bahan ${b.materialId} (${b.name}): ${b.reasons.join('; ')}`).join('\n');
  throw new SeedPreflightError(`Preflight seed menemukan ${plan.blocked.length} bahan tidak konsisten (K-D). `
    + `Seed dihentikan sebelum penulisan pertama; periksa data secara manual:\n${detail}`);
}

async function lockAndClassify(tx, materialId) {
  const locked = await tx.$queryRawUnsafe('SELECT material_id FROM raw_materials WHERE material_id = ? FOR UPDATE', BigInt(materialId));
  if (!locked.length) return { material: null, kind: 'K-A' };
  const [material] = await loadLedgerMaterials(tx, [materialId]);
  return { material, kind: classifyMaterialForSeed(material).kind };
}

function testFailHook(done) {
  const limit = process.env.C4_MYSQL_IT === '1' ? Number(process.env.SEED_TEST_FAIL_AFTER_MATERIALS) : NaN;
  if (Number.isInteger(limit) && done >= limit) throw new Error(`[uji] seed dihentikan setelah ${done} bahan`);
}

/** @returns {Promise<{created: number, repaired: number, kept: number}>} */
async function applyMaterialPlan(prisma, plan) {
  let done = 0;
  for (const row of plan.create) {
    await prisma.$transaction(async (tx) => {
      const { kind } = await lockAndClassify(tx, row.materialId);
      if (kind !== 'K-A') throw new SeedDataChangedError(`Bahan ${row.materialId} berubah sejak preflight; jalankan seed ulang.`);
      await tx.rawMaterial.create({ data: { ...row, stock: String(row.stock), minStock: String(row.minStock) } });
      const [{ stock }] = await tx.$queryRawUnsafe('SELECT CAST(stock AS CHAR) AS stock FROM raw_materials WHERE material_id = ?', BigInt(row.materialId));
      await createOpeningBalance(tx, { materialId: row.materialId, stock });
    });
    done += 1;
    testFailHook(done);
  }
  for (const materialId of plan.repair) {
    await prisma.$transaction(async (tx) => {
      const { material, kind } = await lockAndClassify(tx, materialId);
      if (kind !== 'K-C') throw new SeedDataChangedError(`Bahan ${materialId} berubah sejak preflight; jalankan seed ulang.`);
      await createOpeningBalance(tx, { materialId, stock: material.stock });
    });
    done += 1;
    testFailHook(done);
  }
  return { created: plan.create.length, repaired: plan.repair.length, kept: plan.keep.length };
}

module.exports = { SeedPreflightError, SeedDataChangedError, preflightMaterials, assertPlanWritable, applyMaterialPlan };
