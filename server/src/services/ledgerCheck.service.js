// services/ledgerCheck.service.js
// FR-44 · BR-23 · CR-04a CP2 — pemeriksa integritas buku mutasi (`npm run db:check-ledger`; Errata E1 B.7, E1.1 §5).
// Hanya membaca, dalam satu snapshot REPEATABLE READ. Mode produksi: I-1, I-2, I-3, I-7, I-8, I-10, I-11 untuk SELURUH
// bahan, tanpa pengecualian. Mode fixture lama (`legacyFixtures`) hanya setelah verifyLegacyFixtureTarget lulus.

const { Prisma } = require('@prisma/client');
const { loadLedgerMaterials } = require('./ledgerData.service');
const { checkMaterialLedger, hasStockRecords } = require('./ledgerRules.service');
const { verifyLegacyFixtureTarget, isLegacyFixtureMaterial } = require('./ledgerCheckTarget.service');

class LedgerTargetRefusedError extends Error {}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{legacyFixtures?: boolean, databaseUrl?: string, env?: object}} [options]
 * @returns {Promise<{materials: number, checked: number, excluded: number, violations: object[]}>}
 */
async function runLedgerCheck(prisma, { legacyFixtures = false, databaseUrl = '', env = process.env } = {}) {
  return prisma.$transaction(async (tx) => {
    if (legacyFixtures) {
      const [{ db }] = await tx.$queryRawUnsafe('SELECT DATABASE() AS db');
      const verdict = verifyLegacyFixtureTarget({ databaseUrl, currentDatabase: db, env });
      if (!verdict.ok) throw new LedgerTargetRefusedError(`--legacy-fixtures ditolak: ${verdict.reason}`);
    }
    const materials = await loadLedgerMaterials(tx);
    const violations = [];
    let excluded = 0;
    for (const material of materials) {
      if (legacyFixtures && isLegacyFixtureMaterial(material, hasStockRecords)) { excluded += 1; continue; }
      for (const v of checkMaterialLedger(material)) violations.push({ materialId: material.materialId, name: material.name, ...v });
    }
    return { materials: materials.length, checked: materials.length - excluded, excluded, violations };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000, maxWait: 10000 });
}

function formatLedgerReport(result, { legacyFixtures = false } = {}) {
  const mode = legacyFixtures ? 'fixture lama (harness)' : 'produksi (tanpa pengecualian)';
  const lines = [`Buku mutasi — mode ${mode}: ${result.materials} bahan, ${result.checked} diperiksa, ${result.excluded} dikecualikan.`];
  if (!result.violations.length) lines.push('✓ I-1, I-2, I-3, I-7, I-8, I-10, I-11 terpenuhi.');
  else {
    lines.push(`✗ ${result.violations.length} pelanggaran:`);
    for (const v of result.violations) lines.push(`  - bahan ${v.materialId} (${v.name}) ${v.invariant}: ${v.message}`);
  }
  return lines.join('\n');
}

module.exports = { LedgerTargetRefusedError, runLedgerCheck, formatLedgerReport };
