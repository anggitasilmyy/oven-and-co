// routes/admin/rawMaterial.routes.js
// Step 6.4 · FR-32 · UC-24 · AD-07 tab "Bahan Baku" (Staf & Owner). Kontrak = client services/stockService.js
// (getRawMaterials, saveMaterial, recordStockIn).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminRawMaterialService = require('../../services/adminRawMaterial.service');
const { validateMaterialId, validateMaterialBody, validateStockInBody } = require('../../validators/adminCatalog.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/raw-materials → { rows, summary }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminRawMaterialService.getRawMaterialBoard() });
  })
);

// POST /api/admin/raw-materials { name, unit, stock, min_stock } → 201 bahan + status
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateMaterialBody(req.body);
    res.status(201).json({ status: 'success', data: await adminRawMaterialService.saveRawMaterial(null, input) });
  })
);

// PUT /api/admin/raw-materials/:id → bahan + status
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    const input = validateMaterialBody(req.body);
    res.status(200).json({ status: 'success', data: await adminRawMaterialService.saveRawMaterial(materialId, input) });
  })
);

// POST /api/admin/raw-materials/:id/stock-in { qty } → bahan + status
router.post(
  '/:id/stock-in',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    const { qty } = validateStockInBody(req.body);
    res.status(200).json({ status: 'success', data: await adminRawMaterialService.recordStockIn(materialId, qty) });
  })
);

module.exports = router;
