// routes/customer/promo.routes.js
// FR-05 · C-05 Beranda — promo aktif untuk banner (publik, tanpa login; client services/promoService.js)

const express = require('express');
const promoService = require('../../services/promo.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/promos/active
router.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const promos = await promoService.getActivePromos();

    return res.status(200).json({
      status: 'success',
      data: promos,
    });
  })
);

module.exports = router;
