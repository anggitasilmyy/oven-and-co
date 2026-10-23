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

// Pembatas awal yang jauh lebih longgar, SEBELUM autentikasi: melindungi verifikasi JWT & query users dari banjir
// request (termasuk yang berakhir 401/403). 6× pembatas utama agar beberapa pengguna di balik NAT/proxy yang berbagi
// satu IP tidak terkena lebih dulu daripada pembatas utama. Juga in-memory per proses (asumsi prototype).
const DESIGN_PRE_AUTH_RATE_LIMIT = { windowMs: DESIGN_RATE_LIMIT.windowMs, max: DESIGN_RATE_LIMIT.max * 6 };

const designPreAuthRateLimit = createRateLimiter({
  ...DESIGN_PRE_AUTH_RATE_LIMIT,
  message: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.',
});

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/custom-cake-designs
// Pengunjung boleh membuat desain tanpa login; bila token dikirim, token tetap wajib valid.
// Urutan: pembatas awal (longgar) → autentikasi & peran → pembatas utama → baca multipart.
// Request 401/403 (termasuk 401 sesi kedaluwarsa sebelum frontend mengulang sebagai tamu) tidak menghabiskan kuota
// pembatas UTAMA, tetapi tetap dihitung pembatas awal. Request berlebih ditolak sebelum file diproses.
// Catatan: kunci limit = req.ip; di balik NAT/proxy banyak pengguna berbagi IP. `trust proxy` sengaja TIDAK
// diaktifkan (header X-Forwarded-For bisa dipalsukan bila tidak ada proxy tepercaya) — asumsi prototype.
router.post(
  '/',
  designPreAuthRateLimit,
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
module.exports.designPreAuthRateLimit = designPreAuthRateLimit;
module.exports.DESIGN_PRE_AUTH_RATE_LIMIT = DESIGN_PRE_AUTH_RATE_LIMIT;
