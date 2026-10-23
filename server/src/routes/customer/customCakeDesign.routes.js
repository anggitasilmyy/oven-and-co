// routes/customer/customCakeDesign.routes.js
// FR-10 · UC-06 · C-11 Custom Cake Builder — simpan desain (tamu boleh, user_id kosong).
// Body: JSON, atau multipart dengan file `referencePhoto` + string JSON `design`.

const express = require('express');
const optionalAuth = require('../../middlewares/optionalAuth');
const referencePhotoUpload = require('../../middlewares/referencePhotoUpload');
const createRateLimiter = require('../../middlewares/rateLimit');
const customCakeDesignService = require('../../services/customCakeDesign.service');
const { parseMultipartDesign } = require('../../validators/customCakeDesign.validator');
const { validateReferencePhoto } = require('../../utils/referencePhotoStorage');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

// Asumsi prototype: maks. 20 desain per IP per 15 menit (in-memory, per proses — lihat middlewares/rateLimit.js)
const DESIGN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 20 };

const designRateLimit = createRateLimiter({
  ...DESIGN_RATE_LIMIT,
  message: 'Terlalu banyak desain dibuat. Coba lagi beberapa menit lagi.',
});

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/custom-cake-designs
// Pengunjung boleh membuat desain tanpa login; bila token dikirim, token tetap wajib valid.
// Urutan: autentikasi & peran → rate limit → baca multipart. Request 401/403 (termasuk 401 sesi kedaluwarsa
// sebelum frontend mengulang sebagai tamu) tidak dihitung, dan request berlebih ditolak sebelum file diproses.
// Catatan: kunci limit = req.ip; di balik NAT/proxy banyak pengguna berbagi IP (asumsi prototype, tanpa trust proxy).
router.post(
  '/',
  optionalAuth,
  (req, res, next) => {
    if (req.user && req.user.role !== ROLES.CUSTOMER) {
      return res.status(403).json({
        status: 'error',
        message: 'Fitur ini hanya tersedia untuk pengunjung dan pelanggan.',
      });
    }

    return next();
  },
  designRateLimit,
  referencePhotoUpload,
  asyncHandler(async (req, res) => {
    const isMultipart = req.is('multipart/form-data');
    const payload = isMultipart ? parseMultipartDesign(req.body) : req.body || {};
    const photo = isMultipart && req.file ? validateReferencePhoto(req.file) : null;

    const result = await customCakeDesignService.createCustomCakeDesign(
      payload,
      req.user ? req.user.userId : null,
      new Date(),
      { photo }
    );

    return res.status(201).json({
      status: 'success',
      message: 'Desain custom cake berhasil disimpan.',
      data: result,
    });
  })
);

module.exports = router;
module.exports.designRateLimit = designRateLimit;
module.exports.DESIGN_RATE_LIMIT = DESIGN_RATE_LIMIT;
