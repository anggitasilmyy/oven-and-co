// middlewares/reviewPhotoUpload.js
// FR-21 · C-19 — terima POST /api/orders/:orderNumber/reviews sebagai multipart (file `photos` maks. 3 + JSON `review`).
// Pola sama dengan referencePhotoUpload: file disimpan di memori dulu dan baru ditulis ke disk SETELAH ulasan lolos
// validasi (lihat review.service), sehingga ulasan yang ditolak tidak meninggalkan file. JSON biasa diteruskan.

const multer = require('multer');
const { REVIEW_PHOTO_MAX_BYTES } = require('../utils/reviewPhotoStorage');

// Validation rule Ulasan (SPEC §6) & client constants/orderHistory.js REVIEW_MAX_PHOTOS
const REVIEW_MAX_PHOTOS = 3;
// Field `review` memuat komentar (reviews.comment TEXT ≤ 65.535 byte) + rating/tag → beri ruang untuk JSON-nya
const REVIEW_FIELD_MAX_BYTES = 70 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REVIEW_PHOTO_MAX_BYTES,
    files: REVIEW_MAX_PHOTOS,
    fields: 1,
    fieldSize: REVIEW_FIELD_MAX_BYTES,
    // 1 field + maks. 3 file; satu bagian cadangan agar file ke-4 dilaporkan sebagai kelebihan foto
    parts: REVIEW_MAX_PHOTOS + 2,
  },
}).array('photos', REVIEW_MAX_PHOTOS);

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Ukuran foto ulasan maksimal 5 MB.',
  LIMIT_FILE_COUNT: `Maksimal ${REVIEW_MAX_PHOTOS} foto`,
  LIMIT_UNEXPECTED_FILE: 'Foto ulasan harus dikirim pada field photos.',
  LIMIT_FIELD_VALUE: 'Data ulasan terlalu besar.',
};

function reviewPhotoUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();

  return upload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      return next(
        Object.assign(new Error(MULTER_MESSAGES[error.code] ?? 'Unggahan foto tidak valid.'), { statusCode: 400 })
      );
    }

    return next(Object.assign(new Error('Unggahan foto tidak valid.'), { statusCode: 400 }));
  });
}

module.exports = reviewPhotoUpload;
module.exports.REVIEW_MAX_PHOTOS = REVIEW_MAX_PHOTOS;
