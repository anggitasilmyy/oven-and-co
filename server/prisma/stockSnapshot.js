// prisma/stockSnapshot.js
// CR-04a CP2 · IMPL-CP2-2 — snapshot stok pra-migrasi M-4 dan pemeriksaan M-6/M-8 (Errata E1.1 §1).
//   npm run db:snapshot-stock -- --out <berkas.csv>            → tulis CSV + <berkas.csv>.meta.json (jumlah, Σ, SHA-256)
//   npm run db:snapshot-stock -- --compare <berkas.csv>         → M-6: buat ulang dari DATABASE_URL, bandingkan SHA-256
//   npm run db:snapshot-stock -- --verify-opening <berkas.csv>  → M-8: saldo awal per bahan = snapshot = stok sekarang
// Hanya membaca, dalam satu transaksi baca konsisten. Exit 0 = cocok/berhasil, 1 = tidak cocok, 2 = error.

require('dotenv').config();
const fs = require('node:fs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { buildStockSnapshot, parseStockSnapshot, sha256 } = require('../src/services/stockSnapshotRules.service');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

async function readSnapshot(prisma) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe('SELECT material_id, CAST(stock AS CHAR) AS stock FROM raw_materials ORDER BY material_id');
    const [{ total }] = await tx.$queryRawUnsafe('SELECT CAST(COALESCE(SUM(stock), 0) AS CHAR) AS total FROM raw_materials');
    const openings = await tx.$queryRawUnsafe(`SELECT sa.material_id, CAST(sa.qty AS CHAR) AS qty, COUNT(mm.movement_id) AS movements
      FROM stock_adjustments sa LEFT JOIN material_movements mm ON mm.adjustment_id = sa.adjustment_id
      WHERE sa.kind = 'saldo_awal' GROUP BY sa.adjustment_id, sa.material_id, sa.qty`).catch(() => null);
    return { rows, total, openings };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}

function verifyOpenings(expected, snapshot, openings) {
  const problems = [];
  if (!openings) return ['tabel stock_adjustments belum ada'];
  const byMaterial = new Map();
  for (const o of openings) byMaterial.set(String(o.material_id), [...(byMaterial.get(String(o.material_id)) ?? []), o]);
  for (const [id, stock] of expected) {
    const docs = byMaterial.get(id) ?? [];
    if (docs.length !== 1) { problems.push(`bahan ${id}: dokumen saldo awal = ${docs.length}`); continue; }
    if (docs[0].qty !== stock) problems.push(`bahan ${id}: saldo awal ${docs[0].qty} ≠ snapshot ${stock}`);
    const wantMovement = stock !== '0.00' ? 1 : 0;
    if (Number(docs[0].movements) !== wantMovement) problems.push(`bahan ${id}: mutasi saldo awal = ${docs[0].movements}`);
  }
  if (byMaterial.size !== expected.size) problems.push(`jumlah bahan bersaldo awal ${byMaterial.size} ≠ snapshot ${expected.size}`);
  if (snapshot.csv !== [...expected].reduce((s, [id, st]) => `${s}${id},${st}\n`, 'material_id,stock\n')) {
    problems.push('stok sekarang ≠ snapshot');
  }
  return problems;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const { rows, total, openings } = await readSnapshot(prisma);
    const snapshot = buildStockSnapshot(rows);
    if (snapshot.sum !== total) throw new Error(`Σ BigInt ${snapshot.sum} ≠ SUM MySQL ${total}`);
    const out = arg('--out');
    const compare = arg('--compare');
    const verify = arg('--verify-opening');
    if (out) {
      fs.writeFileSync(out, snapshot.csv, { encoding: 'utf8' });
      const fileHash = sha256(fs.readFileSync(out, 'utf8'));
      const meta = { count: snapshot.count, sum: total, sha256: fileHash, created_at: new Date().toISOString() };
      fs.writeFileSync(`${out}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
      console.log(JSON.stringify(meta));
      return;
    }
    const file = compare ?? verify;
    if (!file) throw new Error('Pakai --out, --compare, atau --verify-opening.');
    const text = fs.readFileSync(file, 'utf8');
    const expected = parseStockSnapshot(text);
    const problems = sha256(text) === snapshot.sha256 ? [] : ['SHA-256 snapshot berbeda'];
    if (verify) problems.push(...verifyOpenings(expected, snapshot, openings));
    console.log(problems.length ? `✗ ${problems.join('\n✗ ')}` : `✓ cocok: ${snapshot.count} bahan, Σ ${snapshot.sum}, SHA-256 ${snapshot.sha256}`);
    process.exitCode = problems.length ? 1 : 0;
  } catch (err) {
    console.error(`Snapshot gagal: ${err.message}`);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
