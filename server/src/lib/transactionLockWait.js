// lib/transactionLockWait.js
// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2: batas tunggu kunci baris HANYA selama transaksi interaktif Prisma.
//
// Tiga batas waktu yang berbeda:
//   - Prisma `maxWait` (bawaan 2000 ms): lama menunggu KONEKSI pool untuk memulai transaksi;
//   - Prisma `timeout` (bawaan 5000 ms): umur transaksi interaktif. Prisma hanya memeriksanya di antara query — pernyataan
//     yang sedang MENUNGGU KUNCI tidak dihentikan. Terbukti di MySQL 8 (C4): bila timeout terlewati selagi pernyataan
//     masih antre kunci, Prisma 6.19.3 menutup transaksi dan query berikutnya pada koneksi pool yang sama mengembalikan
//     hasil salah (null untuk baris yang ada → 401 SESSION_INVALID palsu), lalu P1017/P1001;
//   - MySQL `innodb_lock_wait_timeout` (global server tidak diubah): lama maksimum SATU pernyataan menunggu kunci →
//     error 1205, transaksi dibatalkan bersih dan koneksi tetap sehat (terbukti C4).
// Karena itu lock wait di dalam transaksi interaktif harus berakhir (1205) SEBELUM timeout Prisma.
//
// Variabel SESSION menempel pada koneksi MySQL dan TIDAK dikembalikan oleh COMMIT/ROLLBACK maupun oleh pool Prisma
// (terbukti C4: koneksi yang sama tetap bernilai 2 setelah transaksi, lalu UPDATE non-interaktif gagal 1205 di detik ke-2).
// Maka setiap transaksi interaktif:
//   1. menyimpan nilai sesi saat itu ke variabel pengguna `@ovc_saved_lock_wait` (COALESCE: bila penanda masih terisi —
//      pemulihan transaksi sebelumnya di koneksi ini tidak sempat berjalan — nilai asli yang tersimpan dipertahankan);
//   2. memasang `SET SESSION innodb_lock_wait_timeout = 2` (pernyataan sebelum query callback);
//   3. memulihkan nilai tersimpan & mengosongkan penanda di `finally`, MASIH di dalam transaksi (sebelum commit/rollback),
//      baik callback berhasil, melempar exception, maupun gagal 1205/deadlock.
// Error pemulihan tidak pernah menutupi error utama: bila callback gagal, error callback yang dilempar (error pemulihan
// dilampirkan sebagai `sessionRestoreError`). Bila callback berhasil tetapi pemulihan gagal, error pemulihan dilempar
// (transaksi di-rollback) — kondisi sesi tidak boleh dibiarkan tanpa diketahui.
// KETERBATASAN (Prisma 6.19.3, terbukti C4): bila transaksi terkena timeout Prisma (P2028), Prisma menolak query apa pun
// pada transaksi itu, jadi pemulihan tidak bisa dijalankan; nilai 2 tertinggal di koneksi tersebut sampai transaksi
// interaktif berikutnya di koneksi yang sama memulihkannya (berkat penanda). Prisma tidak menyediakan hook per koneksi.
// `SET` bukan pembacaan, jadi read view REPEATABLE READ tetap dibuat pada SELECT biasa pertama (urutan kunci tidak berubah).
// Transaksi bentuk array (`$transaction([...])`) tidak punya timeout interaktif dan diteruskan apa adanya.

const DB_LOCK_WAIT_TIMEOUT_SECONDS = 2;
const SAVED_VARIABLE = '@ovc_saved_lock_wait';

const SESSION_STATEMENTS = Object.freeze({
  save: `SET ${SAVED_VARIABLE} = COALESCE(${SAVED_VARIABLE}, @@SESSION.innodb_lock_wait_timeout)`,
  apply: (seconds) => `SET SESSION innodb_lock_wait_timeout = ${seconds}`,
  restore: `SET SESSION innodb_lock_wait_timeout = ${SAVED_VARIABLE}`,
  clear: `SET ${SAVED_VARIABLE} = NULL`,
});

async function restoreSession(tx) {
  await tx.$executeRawUnsafe(SESSION_STATEMENTS.restore);
  await tx.$executeRawUnsafe(SESSION_STATEMENTS.clear);
}

/**
 * Bungkus `client.$transaction` agar transaksi interaktif memakai batas lock wait sendiri lalu memulihkan nilai sesi.
 * @param {object} client — PrismaClient
 * @param {number} seconds — bilangan bulat ≥ 1 (batas MySQL innodb_lock_wait_timeout)
 * @returns {object} client yang sama
 */
function applyTransactionLockWaitTimeout(client, seconds = DB_LOCK_WAIT_TIMEOUT_SECONDS) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1073741824) {
    throw new Error(`innodb_lock_wait_timeout tidak valid: ${seconds}`);
  }
  const applyStatement = SESSION_STATEMENTS.apply(seconds);
  const originalTransaction = client.$transaction.bind(client);

  client.$transaction = (input, options) => {
    if (typeof input !== 'function') return originalTransaction(input, options);
    return originalTransaction(async (tx) => {
      await tx.$executeRawUnsafe(SESSION_STATEMENTS.save);
      try {
        await tx.$executeRawUnsafe(applyStatement);
      } catch (error) {
        await restoreSession(tx).catch(() => {}); // penanda tetap terisi bila gagal → dipulihkan transaksi berikutnya
        throw error;
      }
      let result;
      try {
        result = await input(tx);
      } catch (error) {
        try {
          await restoreSession(tx);
        } catch (restoreError) {
          if (error && typeof error === 'object') error.sessionRestoreError = restoreError;
        }
        throw error;
      }
      await restoreSession(tx);
      return result;
    }, options);
  };
  return client;
}

module.exports = {
  DB_LOCK_WAIT_TIMEOUT_SECONDS,
  SESSION_STATEMENTS,
  applyTransactionLockWaitTimeout,
};
