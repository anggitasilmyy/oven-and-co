// utils/reviewPhotoStorage.js
// FR-21 · C-19 — penyimpanan lokal foto ulasan (prototype), aturan sama dengan foto referensi custom cake
// (utils/photoStorage.js: JPG/PNG/WebP dari magic bytes, maks. 5 MB, nama acak). Disajikan di /uploads/reviews/<nama>.

const { PHOTO_MAX_BYTES, createPhotoStore } = require('./photoStorage');

const store = createPhotoStore({ folder: 'reviews', label: 'foto ulasan' });

module.exports = {
  // Sama dengan client constants/orderHistory.js REVIEW_PHOTO_MAX_BYTES
  REVIEW_PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
  REVIEW_PHOTO_URL_PREFIX: store.urlPrefix,
  getReviewPhotoDir: store.getDir,
  validateReviewPhoto: store.validate,
  saveReviewPhoto: store.save,
  deleteReviewPhoto: store.remove,
};
