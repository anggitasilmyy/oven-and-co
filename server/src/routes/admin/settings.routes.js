// routes/admin/settings.routes.js
// Step 6.4.10 · FR-36 · UC-30 · A-11 · AD-11 Pengaturan — hanya Owner (SPEC §2: "pengaturan toko & akun staf" adalah
// hak Owner; Staf & pelanggan 403, tamu 401). Kontrak = client services/settingsService.js. Dipasang di /api/admin/settings.
// C1: GET papan pengaturan. C2: PUT profil toko & PUT jam operasional (sakelar metode bayar di paymentMethodAdmin.routes.js).
// Akun staf menyusul (C3).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminSettingsService = require('../../services/adminSettings.service');
const { validateStoreProfileBody, validateOperatingHoursBody } = require('../../validators/adminSettings.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('owner'));

// GET /api/admin/settings → { profile, hours, paymentMethods }
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await adminSettingsService.getStoreSettings() });
}));

// PUT /api/admin/settings { store_name, address, whatsapp_number, preorder_cutoff_time, delivery_radius_km,
// delivery_fee_per_km } → profil tersimpan
router.put('/', asyncHandler(async (req, res) => {
  const input = validateStoreProfileBody(req.body);
  res.status(200).json({ status: 'success', data: await adminSettingsService.updateStoreProfile(input) });
}));

// PUT /api/admin/settings/operating-hours { hours: [7 × { day_of_week, is_open, open_time, close_time }] } → 7 baris
router.put('/operating-hours', asyncHandler(async (req, res) => {
  const rows = validateOperatingHoursBody(req.body);
  res.status(200).json({ status: 'success', data: await adminSettingsService.updateOperatingHours(rows) });
}));

module.exports = router;
