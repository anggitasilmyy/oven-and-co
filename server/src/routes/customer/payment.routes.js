// routes/customer/payment.routes.js
// FR-14 · SPEC §10 — POST /api/payments/:orderNumber/simulate-paid: simulasi webhook payment gateway "lunas"
// (prototype; ditolak bila NODE_ENV=production). Hanya pelanggan pemilik pesanan; nominal & status tidak dari klien.

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const paymentService = require('../../services/payment.service');
const { validateOrderNumberParam } = require('../../validators/order.validator');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole(ROLES.CUSTOMER));

// POST /api/payments/:orderNumber/simulate-paid
router.post(
  '/:orderNumber/simulate-paid',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const result = await paymentService.simulatePaid(req.user.userId, orderNumber);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
