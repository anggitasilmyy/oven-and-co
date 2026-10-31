
const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminOrderService = require('../../services/adminOrder.service');
const adminOrderActions = require('../../services/adminOrderActions.service');
const { validateOrderNumberParam } = require('../../validators/order.validator');
const { validateStatusChangeBody, validateVerifyPickupBody } = require('../../validators/adminOrder.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Semua endpoint di file ini hanya untuk staf dan owner.
router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/orders
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await adminOrderService.getOrders(req.query);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// GET /api/admin/orders/:orderNumber
// Detail AD-04 (tanpa kode pickup — UC-21).
router.get(
  '/:orderNumber',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const detail = await adminOrderService.getOrderByNumber(orderNumber);

    // Kontrak AD-04: data = { order, customer, items, payment, status_log, store, actions }
    return res.status(200).json({
      status: 'success',
      data: detail,
    });
  })
);

// PATCH /api/admin/orders/:orderNumber/status — Step 6.4.2 · FR-28 · UC-20 (client updateAdminOrderStatus)
// Body { from, to, pickup_code?, courier_name? } → { order_number, order_status, points_awarded }
router.patch(
  '/:orderNumber/status',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const input = validateStatusChangeBody(req.body);
    const result = await adminOrderActions.changeOrderStatus(req.user.userId, orderNumber, input);

    return res.status(200).json({ status: 'success', data: result });
  })
);

// POST /api/admin/orders/:orderNumber/verify-pickup — Step 6.4.2 · UC-21 (client verifyPickupCode)
// Body { pickup_code } → { valid: true }; tidak menulis data
router.post(
  '/:orderNumber/verify-pickup',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const { pickup_code: code } = validateVerifyPickupBody(req.body);
    const result = await adminOrderActions.verifyPickupCode(orderNumber, code);

    return res.status(200).json({ status: 'success', data: result });
  })
);

// PATCH /api/admin/orders/:orderNumber/mark-paid — Step 6.4.2 · FR-28 (client markOrderPaid), tanpa body
// → { order_number, payment_status, paid_at }
router.patch(
  '/:orderNumber/mark-paid',
  asyncHandler(async (req, res) => {
    const orderNumber = validateOrderNumberParam(req.params.orderNumber);
    const result = await adminOrderActions.markOrderPaid(orderNumber);

    return res.status(200).json({ status: 'success', data: result });
  })
);

module.exports = router;
