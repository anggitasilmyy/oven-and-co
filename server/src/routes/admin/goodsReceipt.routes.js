// routes/admin/goodsReceipt.routes.js
// CR-04a CP5 · FR-43 · UC-35 · BR-21, BR-23, BR-30, BR-31 · AD-12 detail PO (Staf & Owner) — pembalik & koreksi
// penerimaan. request_id WAJIB. POST /api/admin/goods-receipts/:id/reverse { reason } · /correct { lines, reason, note? }

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validateReceiptReverseBody, validateReceiptCorrectBody } = require('../../validators/purchasing.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { reverseOrCorrectReceipt } = require('../../services/goodsReceipt.service');

const router = express.Router();
const validateReceiptId = (value) => validateIdParam(value, 'ID penerimaan tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

router.post('/:id/reverse', asyncHandler(async (req, res) => {
  const receiptId = validateReceiptId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateReceiptReverseBody(req.body);
  sendOperationResult(res, await reverseOrCorrectReceipt(req.user.userId, receiptId, input, { requestId, correct: false }));
}));

router.post('/:id/correct', asyncHandler(async (req, res) => {
  const receiptId = validateReceiptId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateReceiptCorrectBody(req.body);
  sendOperationResult(res, await reverseOrCorrectReceipt(req.user.userId, receiptId, input, { requestId, correct: true }));
}));

module.exports = router;
