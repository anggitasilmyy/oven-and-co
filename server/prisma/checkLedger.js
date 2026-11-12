// prisma/checkLedger.js
// CR-04a CP2 · FR-44 · BR-23 — `npm run db:check-ledger [-- --legacy-fixtures]`. Hanya membaca DATABASE_URL.
// Exit 0 = lulus · 1 = ada pelanggaran invarian · 2 = mode/target ditolak atau error.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { LedgerTargetRefusedError, runLedgerCheck, formatLedgerReport } = require('../src/services/ledgerCheck.service');

async function main() {
  const legacyFixtures = process.argv.includes('--legacy-fixtures');
  const prisma = new PrismaClient();
  try {
    const result = await runLedgerCheck(prisma, { legacyFixtures, databaseUrl: process.env.DATABASE_URL ?? '' });
    console.log(formatLedgerReport(result, { legacyFixtures }));
    process.exitCode = result.violations.length ? 1 : 0;
  } catch (err) {
    console.error(err instanceof LedgerTargetRefusedError ? err.message : `Pemeriksaan gagal: ${err.message}`);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
