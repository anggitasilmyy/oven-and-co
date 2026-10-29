// routes/customer/order.routes.js
// FR-12 – FR-16 · BR-04 · C-14 Pembayaran · C-15 Bayar · C-16 Pesanan Berhasil — /api/orders untuk pelanggan login.
// Kontrak = client services/orderService.js. Pemilik pesanan selalu dari req.user (token), tidak pernah dari body/URL.

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const orderCreateService = require('../../services/orderCreate.service');
const orderService = require('../../services/order.service');
const { validateOrderBody, validateOrderNumberParam } = require('../../validators/order.validator');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// BR-04: seluruh endpoint pesanan pelanggan wajib login sebagai pelanggan.
router.use(auth, requireRole(ROLES.CUSTOMER));

// POST /api/orders
// Membuat pesanan dari keranjang + pilihan checkout; harga & total dihitung ulang di server.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateOrderBody(req.body);
    const result = await orderCreateService.createOrder(req.user.userId, input);

    return res.status(201).json({
      status: 'success',
      data: result,
    });
  })
);

// GET /api/orders/:orderNumber/payment
// Data halaman Bayar / Pesanan Berhasil (pesanan, pembayaran, metode, sisa waktu).
router.get(
  '/:orderNumber/payment',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const result = await orderService.getOrderPayment(req.user.userId, orderNumber);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
