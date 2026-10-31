// utils/productPhotoStorage.js
// Step 6.4 · FR-30 · AD-06 — penyimpanan lokal foto produk (prototype), aturan sama dengan foto referensi custom cake
// & foto ulasan (utils/photoStorage.js: JPG/PNG/WebP dari magic bytes, maks. 5 MB, nama acak). Disajikan di
// /uploads/products/<nama>. Foto data contoh (/images/products/…) adalah aset frontend dan tidak pernah dihapus di sini.

const { PHOTO_MAX_BYTES, createPhotoStore } = require('./photoStorage');

const store = createPhotoStore({ folder: 'products', label: 'foto produk' });

module.exports = {
  // Sama dengan client constants/adminCatalog.js PRODUCT_PHOTO_MAX_BYTES
  PRODUCT_PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
  PRODUCT_PHOTO_URL_PREFIX: store.urlPrefix,
  getProductPhotoDir: store.getDir,
  validateProductPhoto: store.validate,
  saveProductPhoto: store.save,
  deleteProductPhoto: store.remove,
};
