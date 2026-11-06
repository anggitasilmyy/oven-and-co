// lib/transactionProbe.js
// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2: probe nonce sebagai pernyataan PERTAMA setiap transaksi interaktif.
//
// Terbukti di MySQL 8 + Prisma 6.19.3 (investigasi F-2): bila transaksi terkena timeout Prisma (P2028) selagi pernyataannya
// masih berjalan, koneksi pool itu rusak: transaksi berikutnya gagal P1017, membuat query engine panic, atau koneksi
// bergeser satu respons tanpa error (probe menerima jawaban query sebelumnya). Maka setiap transaksi lebih dulu menjalankan
// `SELECT <nonce> AS nonce, CONNECTION_ID() AS conn` dan membandingkan nonce:
//   - cocok → callback dijalankan (tepat satu kali);
//   - query probe gagal (mis. P1017) → Prisma sudah membuang koneksi itu; transaksi diulang;
//   - hasil tidak cocok (respons basi) → Prisma TIDAK menganggapnya error, sehingga koneksi rusak akan terus dipakai ulang.
//     Maka dikirim TEPAT SATU pernyataan read-only tambahan (`SELECT <nonce baru> AS recovery`) lewat transaksi yang sama;
//     terbukti di MySQL 8 (eksperimen 20/20 + I3): pernyataan itu berakhir P1017 dan Prisma membuang koneksi tersebut
//     (hilang dari PROCESSLIST), sehingga percobaan berikutnya memakai koneksi lain. Hasil/error pernyataan ini diabaikan
//     (tidak menutupi error utama); tidak ada UPDATE/INSERT/DELETE, KILL, atau pemutusan seluruh pool;
//   - transaksi dibatalkan SEBELUM callback, lalu diulang maks. MAX_PROBE_RETRIES kali;
//   - semua percobaan gagal → error probe terakhir diteruskan (500 umum lewat errorHandler).
// Bentuk probe (dua kolom: nonce + CONNECTION_ID) adalah bentuk yang terbukti pulih di uji MySQL — probe satu kolom
// sebelumnya membuat koneksi tetap tidak sinkron secara permanen. Jangan diubah tanpa mengulang I3.
// Yang TIDAK pernah diulang: error setelah callback mulai (validasi, 404, 409, query bisnis, timeout) dan kegagalan
// memulai transaksi sebelum probe (mis. P2028 maxWait — pool penuh), karena itu bukan koneksi rusak.

const crypto = require('node:crypto');

const MAX_PROBE_RETRIES = 2;
const PROBE_MISMATCH = 'TRANSACTION_PROBE_MISMATCH';

/**
 * Bungkus `client.$transaction`: probe nonce sebelum callback, retry hanya untuk kegagalan probe.
 * @param {object} client — PrismaClient (atau client yang $transaction-nya sudah dibungkus)
 * @param {{maxRetries?: number, onRetry?: (error: Error, attempt: number) => void}} [options]
 * @returns {object} client yang sama
 */
function applyTransactionProbe(client, { maxRetries = MAX_PROBE_RETRIES, onRetry = () => {} } = {}) {
  const originalTransaction = client.$transaction.bind(client);

  client.$transaction = async (input, options) => {
    if (typeof input !== 'function') return originalTransaction(input, options);
    for (let attempt = 1; ; attempt += 1) {
      let probeFailed = false;
      try {
        return await originalTransaction(async (tx) => {
          const nonce = crypto.randomInt(1, 2 ** 31 - 1);
          let rows;
          try {
            rows = await tx.$queryRaw`SELECT ${nonce} AS nonce, CONNECTION_ID() AS conn`;
          } catch (error) {
            probeFailed = true;
            throw error;
          }
          if (String(rows?.[0]?.nonce) !== String(nonce)) {
            probeFailed = true;
            const recoveryNonce = crypto.randomInt(1, 2 ** 31 - 1);
            await tx.$queryRaw`SELECT ${recoveryNonce} AS recovery`.catch(() => null); // memicu Prisma membuang koneksi rusak
            throw Object.assign(new Error('Probe koneksi transaksi tidak cocok (koneksi tidak sinkron).'), { code: PROBE_MISMATCH });
          }
          return input(tx); // callback bisnis: hanya setelah probe berhasil, tepat satu kali per transaksi yang lolos
        }, options);
      } catch (error) {
        if (probeFailed && attempt <= maxRetries) {
          onRetry(error, attempt);
          continue;
        }
        throw error;
      }
    }
  };
  return client;
}

module.exports = {
  MAX_PROBE_RETRIES,
  PROBE_MISMATCH,
  applyTransactionProbe,
};
