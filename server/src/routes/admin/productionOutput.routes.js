// routes/admin/productionOutput.routes.js
// CR-04b · FR-46 · UC-37 · AD-13 detail WO (Staf & Owner) — pembalik & koreksi hasil produksi tiga kasus (BR-36). POST /api/admin/production-outputs/:id/reverse { reason } · /correct { qty_output, reason }. request_id WAJIB.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validateOutputReverseBody, validateOutputCorrectBody } = require('../../validators/workOrder.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { reverseOrCorrectOutput } = require('../../services/productionOutput.service');

const router = express.Router();
const validateDocId = (value) => validateIdParam(value, 'ID hasil produksi tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

router.post('/:id/reverse', asyncHandler(async (req, res) => {
  const docId = validateDocId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateOutputReverseBody(req.body);
  sendOperationResult(res, await reverseOrCorrectOutput(req.user.userId, docId, input, { requestId, correct: false }));
}));

router.post('/:id/correct', asyncHandler(async (req, res) => {
  const docId = validateDocId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateOutputCorrectBody(req.body);
  sendOperationResult(res, await reverseOrCorrectOutput(req.user.userId, docId, input, { requestId, correct: true }));
}));

module.exports = router;
