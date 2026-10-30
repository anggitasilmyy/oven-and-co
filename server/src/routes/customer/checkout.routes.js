
const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const checkoutService = require('../../services/checkout.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Seluruh endpoint checkout hanya untuk pelanggan yang sudah login.
router.use(auth, requireRole('customer'));

// GET /api/checkout/context
router.get(
  '/context',
  asyncHandler(async (req, res) => {
    const result = await checkoutService.getCheckoutContext(
      req.user.userId
    );

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
