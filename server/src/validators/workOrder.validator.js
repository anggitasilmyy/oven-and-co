// validators/workOrder.validator.js
// CR-04b · FR-45, FR-46 · SPEC §6 (WO, Mulai/batal WO, Pengeluaran, Selesai WO, Pembalik, Koreksi) — bentuk body endpoint
// produksi. Skema KETAT: field tak dikenal → 400 (Draft 0.8.3 §5.1); kuantitas bahan harus teks (JSON number ditolak oleh
// aturan murni CP3 dengan pesan per field); isi field divalidasi aturan murni workOrderRules di service.

const { z, createError } = require('./zodHelpers');
const { WO_STATUS } = require('../utils/businessConstants');
const { reasonError } = require('../services/purchasingRules.service');

const BODY_INVALID_TEXT = 'Data tidak valid.';
const anyValue = z.unknown().optional();

function parseStrict(shape, body) {
  const result = z.strictObject(shape, { error: BODY_INVALID_TEXT }).safeParse(body ?? {});
  if (!result.success) throw createError(BODY_INVALID_TEXT);
  return body ?? {};
}
const fail = (fieldErrors) => { throw Object.assign(createError(Object.values(fieldErrors)[0]), { fieldErrors }); };
const lineShape = z.strictObject({ material_id: anyValue, qty: anyValue }, { error: BODY_INVALID_TEXT });
const lines = z.array(lineShape, { error: BODY_INVALID_TEXT });

function requireReason(input) {
  const error = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (error) fail({ reason: error });
  return input;
}

const validateWorkOrderBody = (body) => parseStrict({ product_id: anyValue, production_date: anyValue, qty_planned: anyValue, note: anyValue }, body);

function validateWorkOrderTransitionBody(body) {
  const statuses = Object.values(WO_STATUS);
  return parseStrict({ from: z.enum(statuses, { error: BODY_INVALID_TEXT }), to: z.enum(statuses, { error: BODY_INVALID_TEXT }) }, body);
}

const validateIssueBody = (body) => parseStrict({ lines }, body);
const validateIssueReverseBody = (body) => requireReason(parseStrict({ reason: anyValue }, body));
const validateIssueCorrectBody = (body) => requireReason(parseStrict({ lines, reason: anyValue }, body));
const validateCompleteBody = (body) => parseStrict({ qty_output: anyValue, lines: lines.optional() }, body);
const validateOutputReverseBody = (body) => requireReason(parseStrict({ reason: anyValue }, body));
const validateOutputCorrectBody = (body) => requireReason(parseStrict({ qty_output: anyValue, reason: anyValue }, body));

module.exports = {
  validateWorkOrderBody, validateWorkOrderTransitionBody, validateIssueBody, validateIssueReverseBody, validateIssueCorrectBody,
  validateCompleteBody, validateOutputReverseBody, validateOutputCorrectBody,
};
