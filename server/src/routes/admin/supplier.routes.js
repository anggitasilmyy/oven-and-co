// routes/admin/supplier.routes.js
// CR-04a CP5 · FR-41 · UC-33 · BR-17, BR-31 · AD-12 tab Supplier (Staf & Owner). request_id: POST wajib; PUT & PATCH
// opsional (kontrak idempotensi penuh bila dikirim). Replay → status & body identik + header Idempotent-Replay.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { requireRequestId } = require('../../middlewares/requestId');
const { validateIdParam } = require('../../validators/adminCatalog.validator');
const { validateSupplierBody, validateSupplierActiveBody } = require('../../validators/purchasing.validator');
const { sendOperationResult } = require('../../services/operationRequest.service');
const supplierService = require('../../services/supplier.service');

const router = express.Router();
const validateSupplierId = (value) => validateIdParam(value, 'ID supplier tidak valid.');
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/suppliers → supplier + daftar bahan
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'success', data: await supplierService.listSuppliers() });
}));

// POST /api/admin/suppliers { name, phone, address, email, contact_person, note?, material_ids?, request_id } → 201
router.post('/', asyncHandler(async (req, res) => {
  const requestId = requireRequestId(req);
  const input = validateSupplierBody(req.body);
  sendOperationResult(res, await supplierService.createSupplier(req.user.userId, input, { requestId }));
}));

// PUT /api/admin/suppliers/:id (data + daftar bahan pengganti penuh)
router.put('/:id', asyncHandler(async (req, res) => {
  const supplierId = validateSupplierId(req.params.id);
  const input = validateSupplierBody(req.body);
  sendOperationResult(res, await supplierService.updateSupplier(req.user.userId, supplierId, input, { requestId: req.requestId }));
}));

// PATCH /api/admin/suppliers/:id/active { is_active }
router.patch('/:id/active', asyncHandler(async (req, res) => {
  const supplierId = validateSupplierId(req.params.id);
  const isActive = validateSupplierActiveBody(req.body);
  sendOperationResult(res, await supplierService.setSupplierActive(req.user.userId, supplierId, isActive, { requestId: req.requestId }));
}));

module.exports = router;
