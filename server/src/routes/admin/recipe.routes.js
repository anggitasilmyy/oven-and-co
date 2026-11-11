// routes/admin/recipe.routes.js
// CR-03 CP4 · FR-39 · UC-31 · AD-06 — komposisi bahan per produk (Staf & Owner; pelanggan 403, tanpa token 401).
// Dipasang di /api/admin/products SEBELUM router produk. Auth dipasang per rute (bukan router.use) agar permintaan
// produk lain hanya melewati auth satu kali, di router produk.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminRecipeService = require('../../services/adminRecipe.service');
const { validateProductId } = require('../../validators/adminCatalog.validator');
const { validateRecipeBody } = require('../../validators/adminRecipe.validator');

const router = express.Router();
const guard = [auth, requireRole('staf', 'owner')];

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/admin/products/:id/materials → { product_id, product_name, availability_type, items }
router.get(
  '/:id/materials',
  ...guard,
  asyncHandler(async (req, res) => {
    const productId = validateProductId(req.params.id);
    res.status(200).json({ status: 'success', data: await adminRecipeService.getProductRecipe(productId) });
  })
);

// PUT /api/admin/products/:id/materials { items: [{ material_id, qty_per_unit: "0.015" }] } → bentuk sama dengan GET
router.put(
  '/:id/materials',
  ...guard,
  asyncHandler(async (req, res) => {
    const productId = validateProductId(req.params.id);
    const items = validateRecipeBody(req.body);
    res.status(200).json({ status: 'success', data: await adminRecipeService.saveProductRecipe(req.user.userId, productId, items) });
  })
);

module.exports = router;
