// routes/admin/customer.routes.js
// Step 6.4.8 · FR-35 · UC-25 · AD-10 tab "Pelanggan" — Staf & Owner (SPEC §2). Kontrak = client
// services/adminCustomerService.js getAdminCustomers. Tanpa input (pencarian di client), jadi tanpa skema zod.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminCustomerService = require('../../services/adminCustomer.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/customers → [{ user_id, name, email, phone, is_active, total_orders, total_spend, level, last_order_at }]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminCustomerService.getAdminCustomers() });
  })
);

module.exports = router;
