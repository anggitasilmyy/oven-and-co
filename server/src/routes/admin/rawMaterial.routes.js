// routes/admin/rawMaterial.routes.js
// Step 6.4 · FR-32 · UC-24 · AD-07 tab "Bahan Baku" (Staf & Owner). Kontrak = client services/stockService.js
// (getRawMaterials, saveMaterial, recordStockIn).
// CR-04a CP4 · FR-44 · BR-31: endpoint lama menerima `request_id` opsional (kontrak respons tetap); endpoint baru stock
// opname (`request_id` wajib) dan riwayat mutasi. Replay → status & body identik + header Idempotent-Replay.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminRawMaterialService = require('../../services/adminRawMaterial.service');
const { validateMaterialId, validateMaterialBody, validateStockInBody } = require('../../validators/adminCatalog.validator');
const { validateStockCountBody } = require('../../validators/stockLedger.validator');
const { requireRequestId } = require('../../middlewares/requestId');
const { sendOperationResult } = require('../../services/operationRequest.service');
const adminStockDocumentService = require('../../services/adminStockDocument.service');

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
    sendOperationResult(res, await adminRawMaterialService.saveRawMaterial(req.user.userId, null, input, { requestId: req.requestId }));
  })
);

// PUT /api/admin/raw-materials/:id → bahan + status
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    const input = validateMaterialBody(req.body);
    sendOperationResult(res, await adminRawMaterialService.saveRawMaterial(req.user.userId, materialId, input, { requestId: req.requestId }));
  })
);

// POST /api/admin/raw-materials/:id/stock-in { qty } → bahan + status
router.post(
  '/:id/stock-in',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    const { qty } = validateStockInBody(req.body);
    sendOperationResult(res, await adminRawMaterialService.recordStockIn(req.user.userId, materialId, qty, { requestId: req.requestId }));
  })
);

// CR-04a: POST /api/admin/raw-materials/:id/stock-counts { counted_stock, expected_stock, reason?, request_id } → 201
router.post(
  '/:id/stock-counts',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    const requestId = requireRequestId(req);
    const input = validateStockCountBody(req.body);
    sendOperationResult(res, await adminStockDocumentService.countStock(req.user.userId, materialId, input, { requestId }));
  })
);

// CR-04a: GET /api/admin/raw-materials/:id/movements → { material, movements[] }
router.get(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const materialId = validateMaterialId(req.params.id);
    res.status(200).json({ status: 'success', data: await adminStockDocumentService.getMaterialMovements(materialId) });
  })
);

module.exports = router;
