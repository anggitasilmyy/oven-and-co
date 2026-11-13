// routes/admin/purchaseOrder.routes.js
// CR-04a CP5 · FR-42, FR-43 · UC-34, UC-35 · BR-18 – BR-22, BR-31 · AD-12 tab Purchase Order & detail PO (Staf & Owner).
// request_id: POST PO, PATCH status, POST penerimaan WAJIB; PUT PO Draft opsional.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validatePurchaseOrderBody, validateTransitionBody, validateReceiptBody } = require('../../validators/purchasing.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const { listPurchaseOrders, getPurchaseOrder } = require('../../services/purchaseOrderView.service');
const purchaseOrderService = require('../../services/purchaseOrder.service');
const { receivePurchaseOrder } = require('../../services/goodsReceipt.service');

const router = express.Router();
const validatePoId = (value) => validateIdParam(value, 'ID purchase order tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await listPurchaseOrders() });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await getPurchaseOrder(validatePoId(req.params.id)) });
}));

// POST /api/admin/purchase-orders { supplier_id, note?, items[{material_id, qty_ordered, unit_price}], request_id } → 201
router.post('/', asyncHandler(async (req, res) => {
  const requestId = requireRequestId(req);
  const input = validatePurchaseOrderBody(req.body);
  sendOperationResult(res, await purchaseOrderService.createPurchaseOrder(req.user.userId, input, { requestId }));
}));

// PUT /api/admin/purchase-orders/:id — hanya Draft
router.put('/:id', asyncHandler(async (req, res) => {
  const poId = validatePoId(req.params.id);
  const input = validatePurchaseOrderBody(req.body);
  sendOperationResult(res, await purchaseOrderService.updatePurchaseOrder(req.user.userId, poId, input, { requestId: req.requestId }));
}));

// PATCH /api/admin/purchase-orders/:id/status { from, to, cancel_reason?, request_id }
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const poId = validatePoId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateTransitionBody(req.body);
  sendOperationResult(res, await purchaseOrderService.transitionPurchaseOrder(req.user.userId, poId, input, { requestId }));
}));

// POST /api/admin/purchase-orders/:id/receipts { lines[{po_item_id, qty}], note?, request_id } → 201
router.post('/:id/receipts', asyncHandler(async (req, res) => {
  const poId = validatePoId(req.params.id);
  const requestId = requireRequestId(req);
  const input = validateReceiptBody(req.body);
  sendOperationResult(res, await receivePurchaseOrder(req.user.userId, poId, input, { requestId }));
}));

module.exports = router;
