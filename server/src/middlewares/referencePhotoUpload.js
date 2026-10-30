// middlewares/referencePhotoUpload.js
// FR-10 · C-11 — terima POST /api/custom-cake-designs sebagai multipart (file `referencePhoto` + JSON `design`).
// File disimpan di memori dulu: baru ditulis ke disk SETELAH desain lolos validasi (lihat customCakeDesign.service),
// sehingga desain yang ditolak tidak meninggalkan file. Permintaan JSON biasa diteruskan tanpa diubah.

const multer = require('multer');
const { REFERENCE_PHOTO_MAX_BYTES } = require('../utils/referencePhotoStorage');

const DESIGN_FIELD_MAX_BYTES = 10 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REFERENCE_PHOTO_MAX_BYTES,
    files: 1,
    fields: 1,
    fieldSize: DESIGN_FIELD_MAX_BYTES,
    parts: 2,
  },
}).single('referencePhoto');

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Ukuran foto referensi maksimal 5 MB.',
  LIMIT_FILE_COUNT: 'Foto referensi maksimal 1 file.',
  LIMIT_UNEXPECTED_FILE: 'Foto referensi harus dikirim pada field referencePhoto.',
  LIMIT_FIELD_VALUE: 'Data desain custom cake terlalu besar.',
};

function referencePhotoUpload(req, res, next) {
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

module.exports = referencePhotoUpload;
