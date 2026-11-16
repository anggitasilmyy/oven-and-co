// routes/admin/materialIssue.routes.js
// CR-04b · FR-46 · UC-37 · AD-13 detail WO (Staf & Owner) — pembalik & koreksi pengeluaran bahan (BR-23, BR-30). POST /api/admin/material-issues/:id/reverse { reason } · /correct { lines, reason }. request_id WAJIB.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validateIssueReverseBody, validateIssueCorrectBody } = require('../../validators/workOrder.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { reverseOrCorrectIssue } = require('../../services/materialIssue.service');

const router = express.Router();
const validateDocId = (value) => validateIdParam(value, 'ID pengeluaran tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

router.post('/:id/reverse', asyncHandler(async (req, res) => {
  const docId = validateDocId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateIssueReverseBody(req.body);
  sendOperationResult(res, await reverseOrCorrectIssue(req.user.userId, docId, input, { requestId, correct: false }));
}));

router.post('/:id/correct', asyncHandler(async (req, res) => {
  const docId = validateDocId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateIssueCorrectBody(req.body);
  sendOperationResult(res, await reverseOrCorrectIssue(req.user.userId, docId, input, { requestId, correct: true }));
}));

module.exports = router;
