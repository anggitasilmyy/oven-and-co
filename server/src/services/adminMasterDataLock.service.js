// services/adminMasterDataLock.service.js
// Step 6.4 · AD-06 · AD-07 — serialisasi perubahan master data admin (produk, opsi custom cake, bahan baku, rencana
// stok harian) tanpa mengubah schema.
//
// Aturan "nama unik" (opsi per kelompok, bahan baku), "satu produk custom aktif", dan "minimal satu opsi aktif per
// kelompok" tidak punya UNIQUE/CHECK di SPEC §8, jadi dijaga aplikasi. SELECT … FOR UPDATE terhadap nama yang BELUM
// punya baris tidak mengunci apa pun yang stabil, sehingga dua transaksi bisa sama-sama lolos pengecekan. Karena itu
// setiap transaksi master data mengunci satu baris yang PASTI ada dan tidak pernah dihapus: store_settings (SPEC §8:
// satu baris, setting_id = 1) lewat primary key — tepat satu baris, tanpa gap lock / table scan. Kunci ini WAJIB
// menjadi pembacaan pertama transaksi (InnoDB REPEATABLE READ membuat snapshot pada SELECT biasa pertama), sehingga
// pengecekan berikutnya melihat data yang sudah di-commit transaksi admin sebelumnya.
// Checkout & web pelanggan hanya membaca store_settings tanpa kunci (consistent read), jadi tidak ikut menunggu.

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Kunci baris store_settings (urutan kunci pertama di semua transaksi master data admin) */
async function lockAdminMasterData(tx) {
  const rows = await tx.$queryRaw`SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE`;
  if (rows.length === 0) throw httpError(500, 'Pengaturan toko belum tersedia.');
}

module.exports = {
  lockAdminMasterData,
};
