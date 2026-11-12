// validators/stockLedger.validator.js
// CR-04a CP4 · FR-44 · BR-35 · SPEC §6 (Stock opname, Pembalik, Koreksi) — body endpoint dokumen stok AD-07 baru.
// Skema ketat: field tak dikenal → 400 (Draft 0.8.3 §5.1). Desimal wajib teks (JSON number ditolak) dan divalidasi
// aturan murni CP3 sebelum transaksi; hasil = payload ter-normalisasi (dipakai juga untuk hash request_id).

const { z, createError } = require('./zodHelpers');
const { STOCK_QTY_MAX } = require('../utils/businessConstants');
const { validateStockCountInput } = require('../services/stockLedgerRules.service');
const { parseDecimalInput, centsToDecimalString } = require('../services/decimalInputRules.service');
const { reasonError } = require('../services/purchasingRules.service');

const BODY_INVALID_TEXT = 'Data tidak valid.';

function strictBody(body, keys) {
  const schema = z.strictObject(Object.fromEntries(keys.map((k) => [k, z.unknown().optional()])), { error: BODY_INVALID_TEXT });
  if (!schema.safeParse(body ?? {}).success) throw createError(BODY_INVALID_TEXT);
  return body ?? {};
}

function fail(fieldErrors) {
  throw Object.assign(createError(Object.values(fieldErrors)[0]), { fieldErrors });
}

/** { counted_stock, expected_stock, reason? } → { counted_stock, expected_stock, reason } */
function validateStockCountBody(body) {
  const input = strictBody(body, ['counted_stock', 'expected_stock', 'reason']);
  const result = validateStockCountInput(input);
  const reason = reasonError(input.reason, { required: false });
  const errors = { ...(result.errors ?? {}), ...(reason ? { reason } : {}) };
  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string') errors.reason = BODY_INVALID_TEXT;
  if (Object.keys(errors).length) fail(errors);
  return { ...result.value, reason: typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null };
}

/** Pembalik { reason } → { reason } */
function validateReverseBody(body) {
  const input = strictBody(body, ['reason']);
  const reason = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (reason) fail({ reason });
  return { reason: input.reason.trim() };
}

/** Koreksi stok masuk { qty, reason } → { qty, reason } */
function validateCorrectStockInBody(body) {
  const input = strictBody(body, ['qty', 'reason']);
  const errors = {};
  const qty = parseDecimalInput(input.qty, { max: STOCK_QTY_MAX });
  if (qty.error) errors.qty = qty.error;
  const reason = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (reason) errors.reason = reason;
  if (Object.keys(errors).length) fail(errors);
  return { qty: centsToDecimalString(qty.cents), reason: input.reason.trim() };
}

module.exports = { validateStockCountBody, validateReverseBody, validateCorrectStockInBody };
