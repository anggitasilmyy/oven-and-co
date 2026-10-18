
const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminOrderService = require('../../services/adminOrder.service');

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
router.get(
  '/:orderNumber',
  asyncHandler(async (req, res) => {
    const order = await adminOrderService.getOrderByNumber(
      req.params.orderNumber
    );

    return res.status(200).json({
      status: 'success',
      data: { order },
    });
  })
);

module.exports = router;
