// routes/customer/cart.routes.js
// FR-11 · FR-04 · BR-04 · C-12 Keranjang — boleh dipakai tamu; token (bila dikirim) menentukan
// desain custom cake mana yang boleh dibaca.
// Step 6.3 · FR-04 · BR-04: /items & /merge = keranjang AKUN tersimpan (pelanggan login saja); keranjang tamu
// tetap di localStorage frontend dan digabung lewat POST /api/cart/merge saat login.

const express = require('express');
const optionalAuth = require('../../middlewares/optionalAuth');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const cartService = require('../../services/cart.service');
const savedCartService = require('../../services/savedCart.service');
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

const customerOnly = [auth, requireRole(ROLES.CUSTOMER)];

// GET /api/cart/items
// Isi keranjang akun pelanggan login (tanpa harga; harga terbaru dari POST /api/cart).
router.get(
  '/items',
  ...customerOnly,
  asyncHandler(async (req, res) => {
    const result = await savedCartService.getAccountCart(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// PUT /api/cart/items
// Mengganti seluruh isi keranjang akun. Baris yang tidak bisa disimpan dikembalikan di `skipped`.
router.put(
  '/items',
  ...customerOnly,
  asyncHandler(async (req, res) => {
    const items = validateCartBody(req.body);
    const result = await savedCartService.saveAccountCart(req.user.userId, items);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// POST /api/cart/merge
// Menggabungkan keranjang tamu (dikirim frontend saat login) ke keranjang akun (FR-04).
router.post(
  '/merge',
  ...customerOnly,
  asyncHandler(async (req, res) => {
    const items = validateCartBody(req.body);
    const result = await savedCartService.saveAccountCart(req.user.userId, items, { mergeWithSaved: true });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
