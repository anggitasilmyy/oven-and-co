// routes/admin/promo.routes.js
// Step 6.4.9 · FR-34 · UC-29 · BR-09 · BR-10 · AD-09 Promo & Loyalty — hanya Owner (SPEC §2: "promo & loyalty" adalah
// hak Owner; Staf 403). Kontrak = client services/adminPromoService.js. Dipasang di /api/admin (rute /vouchers & /loyalty).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminVoucherService = require('../../services/adminVoucher.service');
const adminLoyaltyService = require('../../services/adminLoyalty.service');
const {
  validateVoucherId, validateVoucherBody, validateVoucherActiveBody, validateLoyaltyBody,
} = require('../../validators/adminPromo.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const ownerOnly = [auth, requireRole('owner')];

// GET /api/admin/vouchers → { todayKey, rows, products }
router.get('/vouchers', ownerOnly, asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await adminVoucherService.getAdminVoucherBoard() });
}));

// POST /api/admin/vouchers → 201 voucher
router.post('/vouchers', ownerOnly, asyncHandler(async (req, res) => {
  const input = validateVoucherBody(req.body);
  res.status(201).json({ status: 'success', data: await adminVoucherService.saveVoucher(null, input) });
}));

// PUT /api/admin/vouchers/:id { …, quota, expected_quota? } → voucher
router.put('/vouchers/:id', ownerOnly, asyncHandler(async (req, res) => {
  const voucherId = validateVoucherId(req.params.id);
  const input = validateVoucherBody(req.body);
  res.status(200).json({ status: 'success', data: await adminVoucherService.saveVoucher(voucherId, input) });
}));

// PATCH /api/admin/vouchers/:id/active { is_active } → voucher
router.patch('/vouchers/:id/active', ownerOnly, asyncHandler(async (req, res) => {
  const voucherId = validateVoucherId(req.params.id);
  const { is_active: isActive } = validateVoucherActiveBody(req.body);
  res.status(200).json({ status: 'success', data: await adminVoucherService.setVoucherActive(voucherId, isActive) });
}));

// GET /api/admin/loyalty → aturan poin & ambang level
router.get('/loyalty', ownerOnly, asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await adminLoyaltyService.getLoyaltyRules() });
}));

// PUT /api/admin/loyalty → aturan tersimpan
router.put('/loyalty', ownerOnly, asyncHandler(async (req, res) => {
  const input = validateLoyaltyBody(req.body);
  res.status(200).json({ status: 'success', data: await adminLoyaltyService.updateLoyaltyRules(input) });
}));

module.exports = router;
