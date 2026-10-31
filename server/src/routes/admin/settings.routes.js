// routes/admin/settings.routes.js
// Step 6.4.10 · FR-36 · UC-30 · A-11 · AD-11 Pengaturan — hanya Owner (SPEC §2: "pengaturan toko & akun staf" adalah
// hak Owner; Staf & pelanggan 403, tamu 401). Kontrak = client services/settingsService.js. Dipasang di /api/admin/settings.
// C1: GET papan pengaturan. Penyimpanan profil, jam operasional, metode bayar, dan akun staf menyusul (C2/C3).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminSettingsService = require('../../services/adminSettings.service');

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

module.exports = router;
