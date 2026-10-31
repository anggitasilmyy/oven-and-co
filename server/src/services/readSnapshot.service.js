// services/readSnapshot.service.js
// Step 6.4.6 · AD-02 (dipakai lagi AD-08) — snapshot baca konsisten untuk layar admin yang menggabungkan banyak query.
//
// Tanpa transaksi, setiap statement Prisma berjalan autocommit di koneksi pool masing-masing dan mendapat read view
// sendiri; relasi `include` juga dimuat dengan SELECT terpisah. Commit di antara dua statement (checkout, pelunasan,
// pembatalan, moderasi ulasan) membuat satu respons berisi angka dari waktu yang berbeda, mis. "Perlu Diproses" sudah
// naik tetapi omzet belum.
//
// Di sini semua query berjalan dalam SATU transaksi interaktif InnoDB REPEATABLE READ: SELECT biasa (consistent read)
// memakai satu read view yang dibuat pada SELECT pertama, sehingga seluruh bagian — termasuk statement relasi
// `include` — melihat kumpulan commit yang sama.
//   - Bukan READ COMMITTED: read view baru per statement (masalah tetap ada).
//   - Bukan SERIALIZABLE: dengan autocommit mati InnoDB mengubah SELECT biasa menjadi locking read (FOR SHARE) yang
//     menahan checkout/pembayaran.
//   - Tanpa FOR UPDATE / FOR SHARE: consistent read tidak mengambil kunci baris, jadi tidak menunggu atau menghambat
//     transaksi tulis dan tidak bisa ikut deadlock.
// Callback WAJIB memakai `tx` (bukan Prisma global) dan menjalankan query berurutan (await satu per satu): transaksi
// interaktif memakai satu koneksi, Promise.all di dalamnya tidak mempercepat apa pun.

const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');

// Batas waktu (ms): menunggu koneksi pool & lama transaksi. Dashboard normal selesai jauh di bawah ini; bila terlewati
// Prisma membatalkan transaksi dan request berakhir 500 (tidak ada data yang ditulis).
const READ_SNAPSHOT_MAX_WAIT_MS = 5000;
const READ_SNAPSHOT_TIMEOUT_MS = 10000;

const READ_SNAPSHOT_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: READ_SNAPSHOT_MAX_WAIT_MS,
  timeout: READ_SNAPSHOT_TIMEOUT_MS,
});

/**
 * Jalankan callback baca dalam satu snapshot REPEATABLE READ.
 * @template T
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>} callback — hanya membaca, lewat `tx`
 * @returns {Promise<T>}
 */
function runInReadSnapshot(callback) {
  return prisma.$transaction(callback, READ_SNAPSHOT_OPTIONS);
}

module.exports = {
  runInReadSnapshot,
  READ_SNAPSHOT_OPTIONS,
};
