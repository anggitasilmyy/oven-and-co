// validators/purchasing.validator.js
// CR-04a CP5 · FR-41 – FR-43 · SPEC §6 (Supplier, Purchase order, Transisi PO, Penerimaan, Pembalik, Koreksi) — bentuk
// body endpoint pembelian. Skema KETAT: field tak dikenal → 400 (Draft 0.8.3 §5.1); kuantitas & harga harus teks (JSON
// number ditolak oleh aturan murni CP3 dengan pesan per field). Isi field divalidasi aturan CP3 di service.

const { z, createError } = require('./zodHelpers');
const { PO_STATUS } = require('../utils/businessConstants');
const { reasonError } = require('../services/purchasingRules.service');

const BODY_INVALID_TEXT = 'Data tidak valid.';
const anyValue = z.unknown().optional();

function parseStrict(shape, body) {
  const result = z.strictObject(shape, { error: BODY_INVALID_TEXT }).safeParse(body ?? {});
  if (!result.success) throw createError(BODY_INVALID_TEXT);
  return body ?? {};
}
const fail = (fieldErrors) => { throw Object.assign(createError(Object.values(fieldErrors)[0]), { fieldErrors }); };

const supplierShape = { name: anyValue, phone: anyValue, address: anyValue, email: anyValue, contact_person: anyValue, note: anyValue, material_ids: anyValue };
const lineShape = z.strictObject({ po_item_id: anyValue, qty: anyValue }, { error: BODY_INVALID_TEXT });
const itemShape = z.strictObject({ material_id: anyValue, qty_ordered: anyValue, unit_price: anyValue }, { error: BODY_INVALID_TEXT });

function validateSupplierBody(body) {
  return parseStrict(supplierShape, body);
}

function validateSupplierActiveBody(body) {
  const input = parseStrict({ is_active: z.boolean({ error: BODY_INVALID_TEXT }) }, body);
  return input.is_active;
}

function validatePurchaseOrderBody(body) {
  return parseStrict({ supplier_id: anyValue, note: anyValue, items: z.array(itemShape, { error: BODY_INVALID_TEXT }) }, body);
}

function validateTransitionBody(body) {
  const statuses = Object.values(PO_STATUS);
  const input = parseStrict({ from: z.enum(statuses, { error: BODY_INVALID_TEXT }), to: z.enum(statuses, { error: BODY_INVALID_TEXT }), cancel_reason: anyValue }, body);
  const error = input.cancel_reason == null ? null : (typeof input.cancel_reason === 'string' ? reasonError(input.cancel_reason, { required: false }) : BODY_INVALID_TEXT);
  if (error) fail({ cancel_reason: error });
  return input;
}

function validateReceiptBody(body) {
  return parseStrict({ lines: z.array(lineShape, { error: BODY_INVALID_TEXT }), note: anyValue }, body);
}

function requireReason(input) {
  const error = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (error) fail({ reason: error });
  return input;
}

function validateReceiptReverseBody(body) {
  return requireReason(parseStrict({ reason: anyValue }, body));
}

function validateReceiptCorrectBody(body) {
  return requireReason(parseStrict({ lines: z.array(lineShape, { error: BODY_INVALID_TEXT }), reason: anyValue, note: anyValue }, body));
}

module.exports = {
  validateSupplierBody, validateSupplierActiveBody, validatePurchaseOrderBody, validateTransitionBody, validateReceiptBody,
  validateReceiptReverseBody, validateReceiptCorrectBody,
};
