// Uji CR-04a CP7 (Vitest) · BR-31 · SPEC §6 — validator body rute mode mock (services/mock/requestBody.js) = validator
// server (validators/{purchasing,stockLedger,adminCatalog}.validator.js) untuk body yang sama: lolos/ditolak, pesan,
// fieldErrors, hasil normalisasi; ID parameter (INVALID_ID). Body diuji setelah JSON round-trip (seperti Express).

import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

vi.mock('../../src/stores/useAuthStore', () => ({ default: { getState: () => ({ user: null }) } }));

const require = createRequire(import.meta.url);
const SP = require('../../../server/src/validators/purchasing.validator.js');
const SL = require('../../../server/src/validators/stockLedger.validator.js');
const SC = require('../../../server/src/validators/adminCatalog.validator.js');
const C = await import('../../src/services/mock/requestBody.js');

const run = (fn, body) => {
  try { return { ok: true, value: fn(body) }; } catch (e) {
    return { ok: false, status: e.statusCode ?? e.status, message: e.message, fieldErrors: e.fieldErrors ?? null, code: e.apiCode ?? e.code ?? null };
  }
};
const json = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function same(name, serverFn, clientFn, bodies) {
  bodies.forEach((body, i) => assert.deepEqual(run(clientFn, body), run(serverFn, json(body)), `${name} #${i} ${JSON.stringify(body)}`));
}

const odd = [undefined, null, [], 'x', 5, true, { extra: 1 }];
const line = { po_item_id: '1', qty: '2' };
const item = { material_id: '1', qty_ordered: '1', unit_price: '1' };

test('pembelian: supplier, aktif, PO, transisi, penerimaan, pembalik & koreksi = server', () => {
  same('supplier', SP.validateSupplierBody, C.validateSupplierBody, [...odd, {}, { name: 'A', phone: 1, material_ids: 'x' }, { name: 'A', note: null }, { name: 'A', is_active: true }]);
  same('aktif', SP.validateSupplierActiveBody, C.validateSupplierActiveBody, [...odd, { is_active: true }, { is_active: 'true' }, { is_active: false, x: 1 }, {}]);
  same('PO', SP.validatePurchaseOrderBody, C.validatePurchaseOrderBody, [...odd, {}, { supplier_id: '1', items: [] }, { items: 'x' }, { items: [item] },
    { items: [{ ...item, extra: 1 }] }, { items: [null] }, { items: [[1]] }, { items: [item], note: 5, supplier_id: 2 }]);
  same('transisi', SP.validateTransitionBody, C.validateTransitionBody, [...odd, {}, { from: 'draft', to: 'dipesan' }, { from: 'draft', to: 'x' },
    { from: 'draft', to: 'dibatalkan', cancel_reason: 'a' }, { from: 'draft', to: 'dibatalkan', cancel_reason: 5 }, { from: 'draft', to: 'dibatalkan', cancel_reason: 'x'.repeat(256) },
    { from: 'draft', to: 'dibatalkan', cancel_reason: null }, { from: 'draft', to: 'dibatalkan', cancel_reason: '   ' }]);
  same('terima', SP.validateReceiptBody, C.validateReceiptBody, [...odd, {}, { lines: [] }, { lines: [line] }, { lines: [{ ...line, x: 1 }] }, { lines: line }, { lines: [line], note: 'n' }]);
  same('balik', SP.validateReceiptReverseBody, C.validateReceiptReverseBody, [...odd, {}, { reason: '' }, { reason: '  ' }, { reason: 5 }, { reason: 'ok' }, { reason: 'x'.repeat(256) }, { reason: 'ok', lines: [] }]);
  same('koreksi', SP.validateReceiptCorrectBody, C.validateReceiptCorrectBody, [...odd, {}, { lines: [line] }, { lines: [line], reason: 'ok' }, { lines: [], reason: 'ok' },
    { lines: 'x', reason: 'ok' }, { lines: [line], reason: '' }, { lines: [line], reason: 'ok', note: 'n' }]);
});

test('AD-07: opname, pembalik/koreksi stok masuk, body bahan & stok masuk lama = server', () => {
  same('opname', SL.validateStockCountBody, C.validateStockCountBody, [...odd, {}, { counted_stock: '1', expected_stock: '1' }, { counted_stock: 1, expected_stock: '1' },
    { counted_stock: '0', expected_stock: '5', reason: '  ' }, { counted_stock: '1.234', expected_stock: '-1' }, { counted_stock: '5', expected_stock: '5', reason: 7 },
    { counted_stock: '100000000', expected_stock: '' }, { counted_stock: '5', expected_stock: '5.0', reason: ' rusak ' }]);
  same('balik stok', SL.validateReverseBody, (b) => C.validateStockDocumentBody(b, false), [...odd, {}, { reason: 'ok' }, { reason: '' }, { reason: 'ok', qty: '1' }]);
  same('koreksi stok', SL.validateCorrectStockInBody, (b) => C.validateStockDocumentBody(b, true), [...odd, {}, { qty: '0', reason: 'x' }, { qty: '4', reason: 'x' },
    { qty: 4, reason: 'x' }, { qty: '4.5', reason: '' }, { qty: '4' }, { qty: '99999999.99', reason: 'x' }, { qty: '100000000', reason: 'x' }]);
  same('bahan', SC.validateMaterialBody, C.validateMaterialBody, [...odd.slice(1), {}, { name: 'A', unit: 'kg', stock: '1', min_stock: 2 }, { name: 5 }, { stock: true },
    { name: 'A', extra: 1, expected_stock: null }]);
  same('stok masuk', SC.validateStockInBody, C.validateStockInBody, [...odd.slice(1), {}, { qty: '1' }, { qty: 2 }, { qty: true }, { qty: '1', extra: 1 }]);
});

test('ID parameter = validateIdParam server (400 INVALID_ID)', () => {
  for (const id of ['1', '0', '01', 'abc', '-1', '1.5', '9223372036854775807', '9223372036854775808', '12345678901234567890', '', ' 1']) {
    assert.deepEqual(run((v) => C.validateIdParam(v, 'ID tidak valid.'), id), run((v) => SC.validateIdParam(v, 'ID tidak valid.'), id), id);
  }
});
