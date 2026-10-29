// routes/customer/order.routes.js
// FR-12 – FR-16 · BR-04 · C-14 Pembayaran · C-15 Bayar · C-16 Pesanan Berhasil — /api/orders untuk pelanggan login.
// FR-17 · C-17 Riwayat Pesanan · C-18 Detail & Tracking — GET /api/orders, GET /api/orders/:orderNumber.
// FR-15 · BR-05 — PATCH /api/orders/:orderNumber/payment (ganti metode).
// FR-19 · FR-20 · BR-08 — PATCH /api/orders/:orderNumber/cancel, POST /api/orders/:orderNumber/reorder.
// Kontrak = client services/orderService.js & services/orderHistoryService.js. Pemilik pesanan selalu dari req.user (token), tidak pernah dari body/URL.

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const orderCreateService = require('../../services/orderCreate.service');
const orderService = require('../../services/order.service');
const myOrdersService = require('../../services/myOrders.service');
const paymentService = require('../../services/payment.service');
const orderActionsService = require('../../services/orderActions.service');
const {
  validateOrderBody, validateOrderNumberParam, validateChangeMethodBody, validateCancelBody, validateReorderBody,
} = require('../../validators/order.validator');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// BR-04: seluruh endpoint pesanan pelanggan wajib login sebagai pelanggan.
router.use(auth, requireRole(ROLES.CUSTOMER));

// GET /api/orders
// Semua pesanan pelanggan login, terbaru dulu.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await myOrdersService.getMyOrders(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: orders,
    });
  })
);

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

// PATCH /api/orders/:orderNumber/payment
// Ganti metode pembayaran selama Menunggu Pembayaran; Bayar di Toko → Dikonfirmasi.
router.patch(
  '/:orderNumber/payment',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const methodCode = validateChangeMethodBody(req.body);
    const result = await paymentService.changePaymentMethod(req.user.userId, orderNumber, methodCode);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// PATCH /api/orders/:orderNumber/cancel
// Pelanggan membatalkan sebelum Sedang Disiapkan (BR-08).
router.patch(
  '/:orderNumber/cancel',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const reason = validateCancelBody(req.body);
    const result = await orderActionsService.cancelMyOrder(req.user.userId, orderNumber, reason);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// POST /api/orders/:orderNumber/reorder
// Rencana "Pesan Lagi": item yang bisa disalin ke keranjang (tidak membuat pesanan).
router.post(
  '/:orderNumber/reorder',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const cartItems = validateReorderBody(req.body);
    const plan = await orderActionsService.getReorderPlan(req.user.userId, orderNumber, cartItems);

    return res.status(200).json({
      status: 'success',
      data: plan,
    });
  })
);

// GET /api/orders/:orderNumber
// Detail, stepper status, info pickup/delivery, pembayaran (C-18).
router.get(
  '/:orderNumber',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const detail = await myOrdersService.getMyOrderDetail(req.user.userId, orderNumber);

    return res.status(200).json({
      status: 'success',
      data: detail,
    });
  })
);

module.exports = router;
