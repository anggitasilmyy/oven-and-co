// middlewares/productPhotoUpload.js
// Step 6.4 · FR-30 · AD-06 — terima POST/PUT /api/admin/products sebagai multipart (file `photos` maks. 5 + JSON
// `product`). Pola sama dengan reviewPhotoUpload: file disimpan di memori dulu dan baru ditulis ke disk setelah lolos
// validasi isi file (lihat adminProduct.service). Permintaan JSON biasa (tanpa foto baru) diteruskan tanpa diubah.

const multer = require('multer');
const { PRODUCT_PHOTO_MAX_BYTES } = require('../utils/productPhotoStorage');
const { PRODUCT_PHOTO_MAX } = require('../utils/businessConstants');

// Field `product` memuat deskripsi & komposisi (TEXT ≤ 65.535 byte masing-masing) + varian → beri ruang JSON-nya
const PRODUCT_FIELD_MAX_BYTES = 200 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRODUCT_PHOTO_MAX_BYTES,
    files: PRODUCT_PHOTO_MAX,
    fields: 1,
    fieldSize: PRODUCT_FIELD_MAX_BYTES,
    // 1 field + maks. 5 file; satu bagian cadangan agar file ke-6 dilaporkan sebagai kelebihan foto
    parts: PRODUCT_PHOTO_MAX + 2,
  },
}).array('photos', PRODUCT_PHOTO_MAX);

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Ukuran foto produk maksimal 5 MB.',
  LIMIT_FILE_COUNT: `Maksimal ${PRODUCT_PHOTO_MAX} foto`,
  LIMIT_PART_COUNT: `Maksimal ${PRODUCT_PHOTO_MAX} foto`,
  LIMIT_UNEXPECTED_FILE: 'Foto produk harus dikirim pada field photos.',
  LIMIT_FIELD_VALUE: 'Data produk terlalu besar.',
  LIMIT_FIELD_COUNT: 'Data produk harus dikirim pada field product.',
};

function productPhotoUpload(req, res, next) {
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

module.exports = productPhotoUpload;
