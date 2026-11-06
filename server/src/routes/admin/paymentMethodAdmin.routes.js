// routes/admin/paymentMethodAdmin.routes.js
// Step 6.4.10 · FR-36 · FR-14 · FR-15 · BR-05 · AD-11 sakelar "Metode pembayaran" — hanya Owner (SPEC §2). Kontrak =
// client services/settingsService.js setPaymentMethodActive. Dipasang di /api/admin/payment-methods.
// Berbeda dari GET /api/payment-methods (paymentMethod.routes.js: metode aktif untuk filter AD-03, Staf & Owner) yang
// tidak diubah.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminSettingsService = require('../../services/adminSettings.service');
const { validatePaymentMethodCode, validateActiveBody } = require('../../validators/adminSettings.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('owner'));

// PATCH /api/admin/payment-methods/:methodCode/active { is_active } → { method_code, is_active }
router.patch('/:methodCode/active', asyncHandler(async (req, res) => {
  const methodCode = validatePaymentMethodCode(req.params.methodCode);
  const isActive = validateActiveBody(req.body);
  res.status(200).json({ status: 'success', data: await adminSettingsService.setPaymentMethodActive(methodCode, isActive) });
}));

module.exports = router;
