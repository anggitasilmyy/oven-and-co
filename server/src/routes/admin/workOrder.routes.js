// routes/admin/workOrder.routes.js
// CR-04b · FR-45, FR-46 · UC-36, UC-37 · BR-25 – BR-29, BR-31, BR-36 · K10 · AD-13 Produksi (Staf & Owner, K09).
// request_id: POST WO, PATCH status, POST pengeluaran, POST selesai WAJIB; PUT WO Draft opsional; GET menolak (middleware).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const {
  validateWorkOrderBody, validateWorkOrderTransitionBody, validateIssueBody, validateCompleteBody,
} = require('../../validators/workOrder.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { listWorkOrders, getWorkOrder, getPlanSource } = require('../../services/workOrderView.service');
const workOrderService = require('../../services/workOrder.service');
const { issueMaterials } = require('../../services/materialIssue.service');
const { completeWorkOrder } = require('../../services/productionOutput.service');

const router = express.Router();
const validateWoId = (value) => validateIdParam(value, 'ID work order tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await listWorkOrders() });
}));

// GET /api/admin/work-orders/plan-source?date=YYYY-MM-DD — isian awal hanya-baca AD-07 (hari ini) & AD-05 (K10)
router.get('/plan-source', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await getPlanSource(typeof req.query.date === 'string' ? req.query.date : '') });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await getWorkOrder(validateWoId(req.params.id)) });
}));

// POST /api/admin/work-orders { product_id, production_date, qty_planned, note?, request_id } → 201
router.post('/', asyncHandler(async (req, res) => {
  const requestId = requireRequestId(req);
  const input = validateWorkOrderBody(req.body);
  sendOperationResult(res, await workOrderService.createWorkOrder(req.user.userId, input, { requestId }));
}));

// PUT /api/admin/work-orders/:id — hanya Draft
router.put('/:id', asyncHandler(async (req, res) => {
  const woId = validateWoId(req.params.id);
  const input = validateWorkOrderBody(req.body);
  sendOperationResult(res, await workOrderService.updateWorkOrder(req.user.userId, woId, input, { requestId: req.requestId }));
}));

// PATCH /api/admin/work-orders/:id/status { from, to, request_id } — mulai (snapshot resep) / batal
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const woId = validateWoId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateWorkOrderTransitionBody(req.body);
  sendOperationResult(res, await workOrderService.transitionWorkOrder(req.user.userId, woId, input, { requestId }));
}));

// POST /api/admin/work-orders/:id/issues { lines[{material_id, qty}], request_id } → 201
router.post('/:id/issues', asyncHandler(async (req, res) => {
  const woId = validateWoId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateIssueBody(req.body);
  sendOperationResult(res, await issueMaterials(req.user.userId, woId, input, { requestId }));
}));

// POST /api/admin/work-orders/:id/complete { qty_output, lines?, request_id } → 201
router.post('/:id/complete', asyncHandler(async (req, res) => {
  const woId = validateWoId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateCompleteBody(req.body);
  sendOperationResult(res, await completeWorkOrder(req.user.userId, woId, input, { requestId }));
}));

module.exports = router;
