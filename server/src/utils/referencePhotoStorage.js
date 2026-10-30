// utils/referencePhotoStorage.js
// FR-10 · C-11 — penyimpanan lokal foto referensi custom cake (prototype), di atas utils/photoStorage.js.
// Tipe file ditentukan dari isi file (magic bytes), bukan dari nama/MIME kiriman klien; nama file selalu acak.
// File disajikan lewat GET /uploads/custom-cakes/<nama> (lihat app.js) dan URL relatif muat di VARCHAR(255).

const { PHOTO_MAX_BYTES, detectImageType, createPhotoStore } = require('./photoStorage');

const store = createPhotoStore({ folder: 'custom-cakes', label: 'foto referensi' });

module.exports = {
  // Sama dengan client constants/customCake.js REFERENCE_PHOTO_MAX_BYTES
  REFERENCE_PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
  REFERENCE_PHOTO_URL_PREFIX: store.urlPrefix,
  getReferencePhotoDir: store.getDir,
  detectImageType,
  validateReferencePhoto: store.validate,
  saveReferencePhoto: store.save,
  deleteReferencePhoto: store.remove,
};
