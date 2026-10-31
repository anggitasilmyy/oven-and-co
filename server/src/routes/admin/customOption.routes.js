// routes/admin/customOption.routes.js
// Step 6.4 · FR-31 · UC-23 · AD-06 tab "Opsi Custom Cake" (Staf & Owner). Kontrak = client
// services/adminProductService.js (getAdminCustomOptions, saveCustomOption, setCustomOptionActive).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminCustomOptionService = require('../../services/adminCustomOption.service');
const { validateOptionId, validateCustomOptionBody, validateActiveBody } = require('../../validators/adminCatalog.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/custom-options → { groups, custom_product, lead_time_days }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminCustomOptionService.getAdminCustomOptions() });
  })
);

// POST /api/admin/custom-options → 201 { option_id }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateCustomOptionBody(req.body);
    res.status(201).json({ status: 'success', data: await adminCustomOptionService.saveCustomOption(null, input) });
  })
);

// PUT /api/admin/custom-options/:id → { option_id }
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const optionId = validateOptionId(req.params.id);
    const input = validateCustomOptionBody(req.body);
    res.status(200).json({ status: 'success', data: await adminCustomOptionService.saveCustomOption(optionId, input) });
  })
);

// PATCH /api/admin/custom-options/:id/active { is_active } → { option_id, is_active }
router.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const optionId = validateOptionId(req.params.id);
    const { is_active: isActive } = validateActiveBody(req.body);
    res.status(200).json({ status: 'success', data: await adminCustomOptionService.setCustomOptionActive(optionId, isActive) });
  })
);

module.exports = router;
