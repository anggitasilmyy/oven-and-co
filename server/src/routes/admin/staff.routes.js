// routes/admin/staff.routes.js
// Step 6.4.10 · FR-36 · FR-26 · UC-30 · A-11 · AD-11 tabel "Akun staf" — hanya Owner (SPEC §2: "pengaturan toko & akun
// staf" adalah hak Owner; Staf & pelanggan 403, tamu 401). Kontrak = client services/settingsService.js.
// Dipasang di /api/admin/staff. C3a: GET daftar akun. C3b: POST tambah akun. C3c: PATCH aktif/nonaktif akun.
// Tidak ada hapus akun maupun ubah peran (keputusan audit AD-11 no. 7).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminStaffService = require('../../services/adminStaff.service');
const adminStaffStatusService = require('../../services/adminStaffStatus.service');
const { validateStaffBody, validateStaffId, validateActiveBody } = require('../../validators/adminSettings.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('owner'));

// GET /api/admin/staff → [{ user_id, name, email, phone, role, is_active, created_at }]
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await adminStaffService.getAdminAccounts() });
}));

// POST /api/admin/staff { name, email, phone, password, role } → 201 akun baru (tanpa kata sandi/hash/google_id)
router.post('/', asyncHandler(async (req, res) => {
  const input = validateStaffBody(req.body);
  res.status(201).json({ status: 'success', data: await adminStaffService.createAdminAccount(input) });
}));

// PATCH /api/admin/staff/:id/active { is_active } → akun (dibaca ulang)
router.patch('/:id/active', asyncHandler(async (req, res) => {
  const targetId = validateStaffId(req.params.id);
  const isActive = validateActiveBody(req.body);
  res.status(200).json({ status: 'success', data: await adminStaffStatusService.setAdminAccountActive(req.user.userId, targetId, isActive) });
}));

module.exports = router;
