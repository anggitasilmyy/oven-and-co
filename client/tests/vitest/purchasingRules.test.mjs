// Uji CR-04a CP3 (Vitest) · FR-41 – FR-44 · BR-17 – BR-24, BR-30, BR-31, BR-35 — aturan murni client
// utils/rules/{decimalInput,purchaseValue,purchasing,stockLedger,idempotency,ledger,ledgerSource}.js harus identik dengan
// server services/*Rules.service.js untuk input yang sama (fixture bersama server tests/helpers/purchasingFixtures.js +
// kasus acak deterministik). Mode mock nantinya memakai modul client ini, API memakai modul server.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../../../server/tests/helpers/purchasingFixtures.js');
const SK = require('../../../server/src/utils/businessConstants.js');
const SD = require('../../../server/src/services/decimalInputRules.service.js');
const SV = require('../../../server/src/services/purchaseValueRules.service.js');
const SP = require('../../../server/src/services/purchasingRules.service.js');
const SL = require('../../../server/src/services/stockLedgerRules.service.js');
const SI = require('../../../server/src/services/idempotencyRules.service.js');
const SG = require('../../../server/src/services/ledgerRules.service.js');
const K = await import('../../src/constants/purchasing.js');
const D = await import('../../src/utils/rules/decimalInput.js');
const V = await import('../../src/utils/rules/purchaseValue.js');
const P = await import('../../src/utils/rules/purchasing.js');
const L = await import('../../src/utils/rules/stockLedger.js');
const I = await import('../../src/utils/rules/idempotency.js');
const G = await import('../../src/utils/rules/ledger.js');

// PRNG deterministik (mulberry32) — kasus acak dapat diulang
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261112);
const int = (n) => Math.floor(rand() * n);
const decimal = (maxWhole) => `${int(maxWhole)}${rand() < 0.7 ? `.${String(int(100)).padStart(2, '0')}` : ''}`;

test('konstanta client = server', () => {
  for (const key of ['PO_MAX_ITEMS', 'STOCK_QTY_MAX', 'PURCHASE_PRICE_MAX', 'DOCUMENT_REASON_MAX', 'PO_STATUS',
    'PO_MANUAL_TRANSITIONS', 'PO_RECEIVABLE_STATUSES', 'SUPPLIER_FIELD_MAX', 'LEDGER_ERROR_CODE', 'REQUEST_ID_POLICY']) {
    assert.deepEqual(JSON.parse(JSON.stringify(K[key])), JSON.parse(JSON.stringify(SK[key])), key);
  }
});

test('input desimal & nilai pembelian: fixture + 300 kasus acak identik dengan server', () => {
  for (const [value, options] of F.DECIMAL_CASES) assert.deepEqual(D.parseDecimalInput(value, options), SD.parseDecimalInput(value, options));
  for (const [qty, price, expected] of F.VALUE_CASES) assert.equal(D.centsToDecimalString(V.lineValueCents(qty, price)), expected);
  for (let i = 0; i < 300; i += 1) {
    const qty = `${rand() < 0.2 ? '-' : ''}${decimal(100000)}`;
    const price = decimal(10000000);
    assert.equal(V.lineValueCents(qty, price), SV.lineValueCents(qty, price), `${qty}×${price}`);
    const raw = rand() < 0.8 ? decimal(1e9) : String(rand());
    assert.deepEqual(D.parseDecimalInput(raw, { max: K.STOCK_QTY_MAX }), SD.parseDecimalInput(raw, { max: SK.STOCK_QTY_MAX }), raw);
  }
});

test('supplier, PO, transisi, penerimaan, koreksi, pembatalan — identik dengan server', () => {
  const materials = new Set(['1', '2', '3']);
  const suppliers = [F.SUPPLIER_OK, { ...F.SUPPLIER_OK, phone: '0812', email: 'x', material_ids: ['1', '1', '7'] }, {}];
  for (const s of suppliers) assert.deepEqual(P.validateSupplier(s, materials), SP.validateSupplier(s, materials));
  const supplier = { supplierActive: true, supplierMaterialIds: new Set(['1', '3']) };
  for (let i = 0; i < 100; i += 1) {
    const items = Array.from({ length: 1 + int(4) }, () => ({ material_id: String(1 + int(4)), qty_ordered: decimal(1000), unit_price: rand() < 0.1 ? 5 : decimal(100000) }));
    assert.deepEqual(P.validatePurchaseOrderItems(items, supplier), SP.validatePurchaseOrderItems(items, supplier));
  }
  for (const from of Object.keys(K.PO_MANUAL_TRANSITIONS)) {
    for (const to of Object.keys(K.PO_MANUAL_TRANSITIONS)) assert.deepEqual(P.purchaseOrderTransitionError(from, from, to), SP.purchaseOrderTransitionError(from, from, to));
  }
  for (let i = 0; i < 100; i += 1) {
    const poItems = new Map([10, 11, 12].map((id) => [String(id), { po_item_id: String(id), material_id: String(id - 9), qty_ordered: '5.00', net_received: decimal(6), qty_cancelled: '0' }]));
    const lines = Array.from({ length: 1 + int(3) }, () => ({ po_item_id: String(10 + int(4)), qty: decimal(4) }));
    const status = ['dipesan', 'diterima_sebagian', 'draft', 'dibatalkan'][int(4)];
    assert.deepEqual(P.validateReceiptLines(status, poItems, lines), SP.validateReceiptLines(status, poItems, lines));
    const original = [{ po_item_id: '10', qty: '1.00' }];
    assert.deepEqual(P.validateReceiptCorrection(status, poItems, original, lines), SP.validateReceiptCorrection(status, poItems, original, lines));
    assert.equal(P.purchaseOrderStatusFromReceipts(status, [...poItems.values()]), SP.purchaseOrderStatusFromReceipts(status, [...poItems.values()]));
    assert.deepEqual(P.cancellationQuantities([...poItems.values()]), SP.cancellationQuantities([...poItems.values()]));
  }
});

test('pembalik, koreksi, saldo akhir, stock opname — rencana mutasi identik dengan server', () => {
  for (let i = 0; i < 200; i += 1) {
    const family = rand() < 0.5 ? 'goods_receipt' : 'stock_adjustment';
    const ids = family === 'goods_receipt' ? ['21', '22', '23'] : ['2'];
    const lineOf = (id) => ({ po_item_id: family === 'goods_receipt' ? id : undefined, material_id: family === 'goods_receipt' ? String(id - 20) : id, qty: decimal(20) });
    const original = ids.filter(() => rand() < 0.7).map(lineOf);
    const replacement = rand() < 0.3 ? null : ids.filter(() => rand() < 0.6).map(lineOf);
    const plan = L.planReversalOrCorrection(family, original, replacement);
    assert.deepEqual(plan, SL.planReversalOrCorrection(family, original, replacement));
    assert.deepEqual(L.correctionShapeError(family, original.length ? original : [lineOf(ids[0])], replacement), SL.correctionShapeError(family, original.length ? original : [lineOf(ids[0])], replacement));
    const stocks = new Map(['1', '2', '3'].map((id) => [id, decimal(30)]));
    assert.deepEqual(L.applyStockDeltas(stocks, plan), SL.applyStockDeltas(stocks, plan));
    const input = { counted_stock: rand() < 0.9 ? decimal(30) : 3, expected_stock: decimal(30) };
    assert.deepEqual(L.validateStockCountInput(input), SL.validateStockCountInput(input));
    if (typeof input.counted_stock === 'string') {
      const locked = rand() < 0.5 ? input.expected_stock : decimal(30);
      assert.deepEqual(L.planStockCount(locked, input.counted_stock, input.expected_stock), SL.planStockCount(locked, input.counted_stock, input.expected_stock));
    }
  }
  for (const kind of ['normal', 'pembalik', 'pengganti', 'saldo_awal', 'stok_masuk', 'stock_opname']) {
    for (const family of ['goods_receipt', 'stock_adjustment']) {
      const doc = { kind, reversed: rand() < 0.3, replaced: rand() < 0.3 };
      assert.deepEqual(L.reversalTargetError(family, doc), SL.reversalTargetError(family, doc));
    }
  }
});

test('idempotensi: kebijakan, payload kanonik, SHA-256 (Web Crypto) = server (node:crypto), keputusan duplikat', async () => {
  const id = '3b1f6c2e-8a4d-4f1b-9c2d-1a2b3c4d5e6f';
  for (const op of [...Object.keys(K.REQUEST_ID_POLICY), null]) {
    for (const value of [undefined, id, id.toUpperCase(), 5]) assert.deepEqual(I.requestIdPolicyError(op, value), SI.requestIdPolicyError(op, value));
  }
  for (let i = 0; i < 50; i += 1) {
    const payload = { note: `  catatan ${int(9)} ü `, lines: [{ po_item_id: String(int(99)), qty: decimal(50) }], to: 'dibatalkan', n: BigInt(int(5)), flag: rand() < 0.5 };
    assert.equal(I.canonicalJson(payload), SI.canonicalJson(payload));
    assert.equal(await I.payloadHash(payload), SI.payloadHash(payload));
  }
  const stored = { actor_id: '7', operation: 'count_stock', target_type: 'raw_material', target_id: '1', payload_hash: 'a'.repeat(64), response_status: 201, response_body: {} };
  for (const change of [{}, { actor_id: '8' }, { payload_hash: 'b' }]) {
    assert.deepEqual(I.duplicateRequestDecision(stored, { ...stored, ...change }), SI.duplicateRequestDecision(stored, { ...stored, ...change }));
  }
});

test('invarian buku mutasi (I-1 – I-11) & klasifikasi seed — identik dengan server', () => {
  const t0 = new Date('2026-11-12T01:00:00Z');
  const opening = (qty) => ({ adjustmentId: '1', kind: 'saldo_awal', qty, openingMaterialId: '1', operationRequestId: null, createdAt: t0 });
  const mv = (id, type, change, before, after, adj) => ({ movementId: String(id), materialId: '1', type, qtyChange: change, stockBefore: before, stockAfter: after, adjustmentId: adj, receiptId: null, poItemId: null, createdAt: t0 });
  const cases = [
    { materialId: '1', name: 'a', stock: '42.00', adjustments: [opening('42.00')], movements: [mv(1, 'saldo_awal', '42.00', '0.00', '42.00', '1')], receiptLines: [] },
    { materialId: '1', name: 'a', stock: '7.25', adjustments: [], movements: [], receiptLines: [] },
    { materialId: '1', name: 'a', stock: '5.00', adjustments: [opening('5.00')], movements: [], receiptLines: [] },
    { materialId: '1', name: 'a', stock: '3.00', adjustments: [opening('0.00'), { adjustmentId: '2', kind: 'stok_masuk', qty: '3.00', operationRequestId: null, createdAt: t0 }], movements: [mv(1, 'stok_masuk', '3.00', '0.00', '3.00', '2')], receiptLines: [] },
  ];
  for (const m of cases) {
    assert.deepEqual(G.checkMaterialLedger(m), SG.checkMaterialLedger(m));
    assert.deepEqual(G.classifyMaterialForSeed(m), SG.classifyMaterialForSeed(m));
  }
  assert.deepEqual(G.classifyMaterialForSeed(null), SG.classifyMaterialForSeed(null));
});
