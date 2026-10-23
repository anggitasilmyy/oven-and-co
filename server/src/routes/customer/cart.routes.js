// routes/customer/cart.routes.js
// FR-11 · FR-04 · BR-04 · C-12 Keranjang — boleh dipakai tamu; token (bila dikirim) menentukan
// desain custom cake mana yang boleh dibaca.

const express = require('express');
const optionalAuth = require('../../middlewares/optionalAuth');
const cartService = require('../../services/cart.service');
const { validateCartBody } = require('../../validators/cart.validator');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/cart
// Menghitung tampilan keranjang dari item yang dikirim frontend.
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (req.user && req.user.role !== ROLES.CUSTOMER) {
      return res.status(403).json({
        status: 'error',
        message: 'Keranjang hanya tersedia untuk pengunjung dan pelanggan.',
      });
    }

    const items = validateCartBody(req.body);

    const result = await cartService.getCartView(items, {
      userId: req.user?.userId ?? null,
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
