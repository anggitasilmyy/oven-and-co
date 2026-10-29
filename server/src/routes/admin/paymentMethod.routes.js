// routes/admin/paymentMethod.routes.js
// FR-28 · AD-03 — GET /api/payment-methods: metode pembayaran aktif untuk filter Pesanan admin.
// Hanya Staf/Owner, sama dengan mock client services/adminOrderService.js getPaymentMethods
// (pelanggan memakai metode dari GET /api/checkout/context).

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const orderService = require('../../services/order.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/payment-methods
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const methods = await orderService.getActivePaymentMethods();

    return res.status(200).json({
      status: 'success',
      data: methods,
    });
  })
);

module.exports = router;
