// routes/admin/stockAdjustment.routes.js
// CR-04a CP4 · FR-44 · UC-35 · BR-30, BR-31 · AD-07 (Staf & Owner) — pembalik & koreksi dokumen stok masuk.
// POST /api/admin/stock-adjustments/:id/reverse { reason, request_id } → 201
// POST /api/admin/stock-adjustments/:id/correct { qty, reason, request_id } → 201
// request_id WAJIB (Draft 0.8.3 §5.1); saldo awal & stock opname tidak dapat dibalik/dikoreksi (400).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validateReverseBody, validateCorrectStockInBody } = require('../../validators/stockLedger.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { reverseOrCorrectStockIn } = require('../../services/adminStockDocument.service');

const router = express.Router();
const validateAdjustmentId = (value) => validateIdParam(value, 'ID dokumen stok tidak valid.');

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

router.post(
  '/:id/reverse',
  asyncHandler(async (req, res) => {
    const adjustmentId = validateAdjustmentId(req.params.id);
    const requestId = requireRequestId(req);
    const input = validateReverseBody(req.body);
    sendOperationResult(res, await reverseOrCorrectStockIn(req.user.userId, adjustmentId, input, { requestId, correct: false }));
  })
);

router.post(
  '/:id/correct',
  asyncHandler(async (req, res) => {
    const adjustmentId = validateAdjustmentId(req.params.id);
    const requestId = requireRequestId(req);
    const input = validateCorrectStockInBody(req.body);
    sendOperationResult(res, await reverseOrCorrectStockIn(req.user.userId, adjustmentId, input, { requestId, correct: true }));
  })
);

module.exports = router;
