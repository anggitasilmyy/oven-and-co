// services/mock/requestBody.js
// CR-04a CP7 · BR-31 · SPEC §6 — lapisan rute server untuk mode mock: urutan sama dengan rute API (request_id
// wajib/format → validator body ketat → runOperation). Port dari server validators/{purchasing,stockLedger}.validator.js
// (zod strictObject: field tak dikenal → 400 "Data tidak valid."; array baris/item wajib berisi objek ketat). Body
// melewati JSON (seperti fetch) agar mock menerima nilai yang persis sama dengan server. Validator server tidak dapat
// dipakai langsung (CommonJS + zod, dependensi server saja); port ini diuji silang di tests/vitest/requestBody.test.mjs.

import { requestIdPolicyError } from '../../utils/rules/idempotency';
import { reasonError } from '../../utils/rules/purchasing';
import { validateStockCountInput } from '../../utils/rules/stockLedger';
import { parseDecimalInput, centsToDecimalString } from '../../utils/rules/decimalInput';
import { PO_STATUS, STOCK_QTY_MAX } from '../../constants/purchasing';
import { createApiError } from '../../utils/apiErrors';
import { API_ERROR_CODE } from '../../constants/apiErrors';
import useAuthStore from '../../stores/useAuthStore';
import { ROLES } from '../../constants/roles';

const BODY_INVALID_TEXT = 'Data tidak valid.';
const invalid = () => createApiError(BODY_INVALID_TEXT, 400);
const fail = (fieldErrors) => { throw createApiError(Object.values(fieldErrors)[0], 400, undefined, { fieldErrors }); };
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strictObject = (v, keys) => isPlainObject(v) && Object.keys(v).every((k) => keys.includes(k));

const ID_PATTERN = /^[1-9]\d{0,18}$/;
const ID_MAX = 9223372036854775807n;

/** validateIdParam server (adminCatalog.validator): BIGINT positif → teks; tidak sah → 400 INVALID_ID */
export function validateIdParam(value, message) {
  const text = String(value);
  if (!ID_PATTERN.test(text) || BigInt(text) > ID_MAX) throw createApiError(message, 400, API_ERROR_CODE.INVALID_ID);
  return text;
}

/** auth + requireRole('staf', 'owner') server: tanpa sesi 401, peran lain 403 (pesan = middleware server) */
function requireAdminSession() {
  const user = useAuthStore.getState().user;
  if (!user) throw createApiError('Autentikasi diperlukan.', 401);
  if (![ROLES.STAF, ROLES.OWNER].includes(user.role)) throw createApiError('Anda tidak memiliki izin untuk mengakses resource ini.', 403);
  return user;
}

/**
 * Urutan rute API CR-04a di mode mock: (1) middleware requestId global — request_id terkirim tetapi tidak sah → 400
 * (sebelum auth); (2) auth/requireRole 401/403; (3) parameter ID 400 INVALID_ID; (4) requireRequestId (wajib → 400);
 * (5) validator body; (6) handler(actor, body) → runMockOperation (idempotensi + aturan bisnis).
 * @param {{operation: string|null, requestId?: string, ids?: Array<[unknown, string]>, body?: unknown, validate?: Function}} route
 */
export async function mockRoute({ operation, requestId, ids = [], body, validate }, handler) {
  const sent = requestId !== undefined && requestId !== null;
  const format = sent ? requestIdPolicyError(operation, requestId) : null;
  if (format) throw createApiError(format.message, format.status);
  const actor = requireAdminSession();
  ids.forEach(([value, message]) => validateIdParam(value, message));
  const required = sent ? null : requestIdPolicyError(operation, undefined);
  if (required) throw createApiError(required.message, required.status);
  return handler(actor, validate ? validate(body) : body);
}

/** Body seperti diterima Express: JSON round-trip (undefined hilang, number tetap number) lalu objek ketat */
function strictBody(body, keys, arrays = {}) {
  const input = body === undefined ? {} : JSON.parse(JSON.stringify(body ?? {}));
  if (!strictObject(input, keys)) throw invalid();
  for (const [key, itemKeys] of Object.entries(arrays)) {
    if (!Array.isArray(input[key]) || !input[key].every((row) => strictObject(row, itemKeys))) throw invalid();
  }
  return input;
}
function requireReason(input) {
  const error = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (error) fail({ reason: error });
  return input;
}

const SUPPLIER_KEYS = ['name', 'phone', 'address', 'email', 'contact_person', 'note', 'material_ids'];
const LINE_KEYS = ['po_item_id', 'qty'];
const ITEM_KEYS = ['material_id', 'qty_ordered', 'unit_price'];

export const validateSupplierBody = (body) => strictBody(body, SUPPLIER_KEYS);

export function validateSupplierActiveBody(body) {
  const input = strictBody(body, ['is_active']);
  if (typeof input.is_active !== 'boolean') throw invalid();
  return input.is_active;
}

export const validatePurchaseOrderBody = (body) => strictBody(body, ['supplier_id', 'note', 'items'], { items: ITEM_KEYS });

export function validateTransitionBody(body) {
  const input = strictBody(body, ['from', 'to', 'cancel_reason']);
  const statuses = Object.values(PO_STATUS);
  if (!statuses.includes(input.from) || !statuses.includes(input.to)) throw invalid();
  const error = input.cancel_reason == null ? null
    : (typeof input.cancel_reason === 'string' ? reasonError(input.cancel_reason, { required: false }) : BODY_INVALID_TEXT);
  if (error) fail({ cancel_reason: error });
  return input;
}

export const validateReceiptBody = (body) => strictBody(body, ['lines', 'note'], { lines: LINE_KEYS });
export const validateReceiptReverseBody = (body) => requireReason(strictBody(body, ['reason']));
export const validateReceiptCorrectBody = (body) => requireReason(strictBody(body, ['lines', 'reason', 'note'], { lines: LINE_KEYS }));

// Endpoint AD-07 lama (Step 6.4): z.object TIDAK ketat (field lain diabaikan), teks/angka boleh, pesan umum
const LEGACY_INVALID_TEXT = 'Data permintaan tidak valid.';
const isText = (v) => v == null || typeof v === 'string';
const isNumberLike = (v) => v == null || typeof v === 'string' || typeof v === 'number';
function legacyBody(body, fields) {
  const input = body === undefined ? {} : JSON.parse(JSON.stringify(body)); // z.object server: null → 400 (bukan {})
  if (!isPlainObject(input) || !Object.entries(fields).every(([k, check]) => check(input[k]))) throw createApiError(LEGACY_INVALID_TEXT, 400);
  return Object.fromEntries(Object.keys(fields).filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
}
export const validateMaterialBody = (body) => legacyBody(body, { name: isText, unit: isText, stock: isNumberLike, min_stock: isNumberLike, expected_stock: isNumberLike });
export const validateStockInBody = (body) => legacyBody(body, { qty: isNumberLike });

/** stock-counts { counted_stock, expected_stock, reason? } → ter-normalisasi */
export function validateStockCountBody(body) {
  const input = strictBody(body, ['counted_stock', 'expected_stock', 'reason']);
  const result = validateStockCountInput(input);
  const reason = reasonError(input.reason, { required: false });
  const errors = { ...(result.errors ?? {}), ...(reason ? { reason } : {}) };
  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string') errors.reason = BODY_INVALID_TEXT;
  if (Object.keys(errors).length) fail(errors);
  return { ...result.value, reason: typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null };
}

/** stock-adjustments/:id/reverse { reason } · /correct { qty, reason } → ter-normalisasi */
export function validateStockDocumentBody(body, correct) {
  const input = strictBody(body, correct ? ['qty', 'reason'] : ['reason']);
  const errors = {};
  let qty = null;
  if (correct) {
    const parsed = parseDecimalInput(input.qty, { max: STOCK_QTY_MAX });
    if (parsed.error) errors.qty = parsed.error;
    else qty = centsToDecimalString(parsed.cents);
  }
  const reason = typeof input.reason === 'string' ? reasonError(input.reason) : 'Alasan wajib diisi.';
  if (reason) errors.reason = reason;
  if (Object.keys(errors).length) fail(errors);
  return correct ? { qty, reason: input.reason.trim() } : { reason: input.reason.trim() };
}
