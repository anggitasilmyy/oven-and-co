// routes/customer/customCakeDesign.routes.js
// FR-10 · UC-06 · C-11 Custom Cake Builder — simpan desain (tamu boleh, user_id kosong)

const express = require('express');
const optionalAuth = require('../../middlewares/optionalAuth');
const customCakeDesignService = require('../../services/customCakeDesign.service');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/custom-cake-designs
// Pengunjung boleh membuat desain tanpa login; bila token dikirim, token tetap wajib valid.
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (req.user && req.user.role !== ROLES.CUSTOMER) {
      return res.status(403).json({
        status: 'error',
        message: 'Fitur ini hanya tersedia untuk pengunjung dan pelanggan.',
      });
    }

    const result =
      await customCakeDesignService.createCustomCakeDesign(
        req.body || {},
        req.user ? req.user.userId : null
      );

    return res.status(201).json({
      status: 'success',
      message: 'Desain custom cake berhasil disimpan.',
      data: result,
    });
  })
);

module.exports = router;
