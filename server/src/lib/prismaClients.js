// lib/prismaClients.js
// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2: dua Prisma client dengan pool terpisah (keputusan opsi C).
//   - client UTAMA (connection_limit 5): semua query biasa & autentikasi (`prisma.user…`, `prisma.$queryRaw`, …);
//   - client TRANSAKSI (connection_limit 4): SEMUA transaksi interaktif. `prisma.$transaction` pada client utama
//     dialihkan ke sini, jadi 33 titik transaksi di services/ tidak perlu diubah.
// Alasan (terbukti di MySQL 8): koneksi yang rusak setelah P2028 atau nilai sesi innodb_lock_wait_timeout yang tertinggal
// hanya bisa mengenai pool transaksi — auth & query biasa tidak pernah memakai koneksi itu. Saat transaksi menunggu kunci,
// auth tetap cepat (pool utama tidak ikut habis). Total koneksi per instance tetap 9 (bawaan sebelumnya pada 4 CPU).
// Client transaksi: timeout 15000 ms (cukup untuk 7 lock wait 2 s berturut-turut), maxWait 2000 ms; opsi per panggilan
// (mis. runInReadSnapshot: maxWait 5 s, timeout 10 s) tetap menimpa nilai bawaan ini. Urutan pernyataan setiap transaksi:
// BEGIN → probe nonce + CONNECTION_ID (transactionProbe.js; gagal/tidak cocok → transaksi diulang di koneksi lain) →
// simpan & pasang lock wait 2 s (transactionLockWait.js) → callback → pulihkan sesi → COMMIT/ROLLBACK.
// `$disconnect` client utama menutup KEDUA pool.

const { applyTransactionLockWaitTimeout } = require('./transactionLockWait');
const { applyTransactionProbe } = require('./transactionProbe');

const MAIN_CONNECTION_LIMIT = 5;
const TRANSACTION_CONNECTION_LIMIT = 4;
const TRANSACTION_OPTIONS = Object.freeze({ timeout: 15000, maxWait: 2000 });

/** DATABASE_URL dengan connection_limit tertentu; parameter lain (pool_timeout, sslaccept, …) dipertahankan */
function withConnectionLimit(databaseUrl, limit) {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(limit));
  return url.toString();
}

/**
 * @param {{databaseUrl?: string, PrismaClient: Function, onProbeRetry?: (error: Error, attempt: number) => void}} options
 * @returns {{prisma: object, transactionClient: object}} prisma = client utama ($transaction & $disconnect dialihkan)
 */
function createPrismaClients({ databaseUrl, PrismaClient, onProbeRetry }) {
  const datasourceFor = (limit) => (databaseUrl ? { datasources: { db: { url: withConnectionLimit(databaseUrl, limit) } } } : {});
  const prisma = new PrismaClient(datasourceFor(MAIN_CONNECTION_LIMIT));
  const transactionClient = new PrismaClient({ ...datasourceFor(TRANSACTION_CONNECTION_LIMIT), transactionOptions: { ...TRANSACTION_OPTIONS } });

  applyTransactionProbe(transactionClient, { onRetry: onProbeRetry });
  applyTransactionLockWaitTimeout(transactionClient);

  const disconnectMain = prisma.$disconnect.bind(prisma);
  prisma.$transaction = transactionClient.$transaction;
  prisma.$disconnect = async () => {
    const results = await Promise.allSettled([disconnectMain(), transactionClient.$disconnect()]);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  };
  return { prisma, transactionClient };
}

module.exports = {
  MAIN_CONNECTION_LIMIT,
  TRANSACTION_CONNECTION_LIMIT,
  TRANSACTION_OPTIONS,
  withConnectionLimit,
  createPrismaClients,
};
