// CR-04a CP2 · FR-44 · BR-23 — aturan murni buku mutasi (ledgerRules, ledgerSourceRules), klasifikasi seed K-A – K-D
// (Errata E1.1 §2), snapshot deterministik (IMPL-CP2-2), dan penjaga --legacy-fixtures (IMPL-CP2-1).

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkMaterialLedger, classifyMaterialForSeed, isValidStock } = require('../src/services/ledgerRules.service');
const { buildStockSnapshot, parseStockSnapshot } = require('../src/services/stockSnapshotRules.service');
const { verifyLegacyFixtureTarget, isLegacyFixtureMaterial } = require('../src/services/ledgerCheckTarget.service');
const { hasStockRecords } = require('../src/services/ledgerRules.service');

const T0 = new Date('2026-11-12T01:00:00.000Z');
const later = (ms) => new Date(T0.getTime() + ms);
const opening = (id, qty, extra = {}) => ({ adjustmentId: String(id), kind: 'saldo_awal', qty, openingMaterialId: '1', operationRequestId: null, createdAt: T0, ...extra });
const mv = (id, type, change, before, after, ref = {}) => ({ movementId: String(id), materialId: '1', type, qtyChange: change, stockBefore: before, stockAfter: after, adjustmentId: null, receiptId: null, poItemId: null, createdAt: T0, ...ref });
const material = (stock, adjustments = [], movements = [], receiptLines = []) => ({ materialId: '1', name: 'Tepung', stock, adjustments, movements, receiptLines });
const codes = (m) => checkMaterialLedger(m).map((v) => v.invariant).sort();

test('saldo awal sah: stok > 0 dengan mutasi pembuka, stok 0 tanpa mutasi', () => {
  assert.deepEqual(codes(material('42.00', [opening(1, '42.00')], [mv(1, 'saldo_awal', '42.00', '0.00', '42.00', { adjustmentId: '1' })])), []);
  assert.deepEqual(codes(material('0.00', [opening(1, '0.00')])), []);
  assert.deepEqual(codes(material('99999999.99', [opening(1, '99999999.99')], [mv(1, 'saldo_awal', '99999999.99', '0.00', '99999999.99', { adjustmentId: '1' })])), []);
});

test('I-7: tanpa saldo awal, saldo awal ganda, mutasi tidak sesuai qty, saldo 0 dengan mutasi', () => {
  assert.ok(codes(material('0.00')).includes('I-7'));
  assert.ok(codes(material('5.00', [opening(1, '5.00'), opening(2, '5.00')])).includes('I-7'));
  assert.ok(codes(material('5.00', [opening(1, '5.00')], [mv(1, 'saldo_awal', '4.00', '0.00', '4.00', { adjustmentId: '1' })])).includes('I-7'));
  assert.ok(codes(material('5.00', [opening(1, '5.00')])).includes('I-7'));
  assert.ok(codes(material('0.00', [opening(1, '0.00')], [mv(1, 'saldo_awal', '1.00', '0.00', '1.00', { adjustmentId: '1' })])).includes('I-7'));
});

test('I-1 & I-2: Σ qty_change = stok; rantai stock_before/after dimulai dari 0', () => {
  const docs = [opening(1, '10.00'), { adjustmentId: '2', kind: 'stok_masuk', qty: '2.50', operationRequestId: null, createdAt: later(1) }];
  const moves = [mv(1, 'saldo_awal', '10.00', '0.00', '10.00', { adjustmentId: '1' }), mv(2, 'stok_masuk', '2.50', '10.00', '12.50', { adjustmentId: '2' })];
  assert.deepEqual(codes(material('12.50', docs, moves)), []);
  assert.ok(codes(material('13.00', docs, moves)).includes('I-1'));
  const broken = [moves[0], mv(2, 'stok_masuk', '2.50', '9.00', '11.50', { adjustmentId: '2' })];
  assert.ok(codes(material('12.50', docs, broken)).includes('I-2'));
});

test('I-8: stok masuk tanpa mutasi, koreksi R + P berbagi operation_request_id (mutasi bersih −2 merujuk P)', () => {
  const docs = [opening(1, '0.00'), { adjustmentId: '2', kind: 'stok_masuk', qty: '10.00', operationRequestId: null, createdAt: later(1) }];
  assert.ok(codes(material('0.00', docs)).includes('I-8'));
  const op = '11111111-1111-4111-8111-111111111111';
  const full = [...docs,
    { adjustmentId: '3', kind: 'pembalik_stok_masuk', qty: '10.00', reversesId: '2', operationRequestId: op, createdAt: later(2) },
    { adjustmentId: '4', kind: 'pengganti_stok_masuk', qty: '8.00', replacesId: '2', operationRequestId: op, createdAt: later(2) }];
  const moves = [mv(1, 'stok_masuk', '10.00', '0.00', '10.00', { adjustmentId: '2' }), mv(2, 'koreksi_stok_masuk', '-2.00', '10.00', '8.00', { adjustmentId: '4' })];
  assert.deepEqual(codes(material('8.00', full, moves)), []);
  const wrongType = [moves[0], mv(2, 'stok_masuk', '-2.00', '10.00', '8.00', { adjustmentId: '4' })];
  assert.ok(codes(material('8.00', full, wrongType)).includes('T-28'));
});

test('I-10: opname selisih ≠ 0 tepat satu mutasi fisik − sistem; selisih 0 tanpa mutasi', () => {
  const opname = (counted, system) => ({ adjustmentId: '2', kind: 'stock_opname', countedStock: counted, systemStock: system, operationRequestId: null, createdAt: later(1) });
  const base = [mv(1, 'saldo_awal', '5.00', '0.00', '5.00', { adjustmentId: '1' })];
  assert.deepEqual(codes(material('5.00', [opening(1, '5.00'), opname('5.00', '5.00')], base)), []);
  assert.deepEqual(codes(material('3.00', [opening(1, '5.00'), opname('3.00', '5.00')], [...base, mv(2, 'stock_opname', '-2.00', '5.00', '3.00', { adjustmentId: '2' })])), []);
  assert.ok(codes(material('5.00', [opening(1, '5.00'), opname('3.00', '5.00')], base)).includes('I-10'));
});

test('I-11: saldo awal harus dokumen & mutasi pertama, sebelum penerimaan', () => {
  const docs = [{ adjustmentId: '1', kind: 'stok_masuk', qty: '1.00', operationRequestId: null, createdAt: T0 }, opening(2, '0.00', { createdAt: later(5) })];
  assert.ok(codes(material('1.00', docs, [mv(1, 'stok_masuk', '1.00', '0.00', '1.00', { adjustmentId: '1' })])).includes('I-11'));
  const line = { receiptId: '7', poItemId: '9', qty: '1.00', kind: 'normal', operationRequestId: 'op-1', createdAt: T0 };
  const lateOpening = [opening(1, '0.00', { createdAt: later(5) })];
  const recv = [mv(1, 'penerimaan', '1.00', '0.00', '1.00', { receiptId: '7', poItemId: '9' })];
  assert.ok(codes(material('1.00', lateOpening, recv, [line])).includes('I-11'));
  assert.deepEqual(codes(material('1.00', [opening(1, '0.00')], recv, [{ ...line, createdAt: later(9) }])), []);
});

test('klasifikasi seed K-A – K-D (Errata E1.1 §2)', () => {
  assert.equal(classifyMaterialForSeed(null).kind, 'K-A');
  assert.equal(classifyMaterialForSeed(material('42.00', [opening(1, '42.00')], [mv(1, 'saldo_awal', '42.00', '0.00', '42.00', { adjustmentId: '1' })])).kind, 'K-B');
  assert.equal(classifyMaterialForSeed(material('7.25')).kind, 'K-C');
  assert.equal(classifyMaterialForSeed(material('0.00')).kind, 'K-C');
  // K-D (a): tanpa saldo awal tetapi punya mutasi / dokumen transaksi (opname selisih 0 = dokumen tanpa mutasi)
  assert.equal(classifyMaterialForSeed(material('1.00', [], [mv(1, 'stok_masuk', '1.00', '0.00', '1.00', { adjustmentId: '9' })])).kind, 'K-D');
  assert.equal(classifyMaterialForSeed(material('1.00', [{ adjustmentId: '2', kind: 'stock_opname', countedStock: '1.00', systemStock: '1.00', createdAt: T0 }])).kind, 'K-D');
  assert.equal(classifyMaterialForSeed(material('1.00', [], [], [{ receiptId: '1', poItemId: '1', qty: '1.00', kind: 'normal', createdAt: T0 }])).kind, 'K-D');
  // K-D (b): saldo awal ada tetapi tidak konsisten; (c) stok tidak sah
  assert.equal(classifyMaterialForSeed(material('5.00', [opening(1, '5.00')])).kind, 'K-D');
  assert.equal(classifyMaterialForSeed(material('-1.00')).kind, 'K-D');
  assert.equal(isValidStock('100000000.00'), false);
  assert.equal(isValidStock('1.005'), false);
});

test('snapshot deterministik: urut material_id numerik, LF, tanpa BOM, Σ eksak, hash stabil', () => {
  const rows = [{ material_id: '10', stock: '1234.56' }, { material_id: '2', stock: '0.00' }, { material_id: 1n, stock: '99999999.99' }];
  const a = buildStockSnapshot(rows);
  const b = buildStockSnapshot([...rows].reverse());
  assert.equal(a.csv, 'material_id,stock\n1,99999999.99\n2,0.00\n10,1234.56\n');
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.sum, '100001234.55');
  assert.notEqual(buildStockSnapshot([{ material_id: '1', stock: '0.01' }]).sha256, buildStockSnapshot([{ material_id: '1', stock: '0.02' }]).sha256);
  assert.throws(() => buildStockSnapshot([{ material_id: '1', stock: '6.5' }]));
  assert.equal(parseStockSnapshot(a.csv).get('10'), '1234.56');
  assert.throws(() => parseStockSnapshot(a.csv.replace(/\n/g, '\r\n')));
  assert.throws(() => parseStockSnapshot(`﻿${a.csv}`));
});

test('IMPL-CP2-1: --legacy-fixtures hanya untuk database uji harness yang terverifikasi', () => {
  const ok = { databaseUrl: 'mysql://root:x@127.0.0.1:33306/ovenco_c4_test', currentDatabase: 'ovenco_c4_test', env: { OVENCO_LEDGER_TEST_DB: 'ovenco_c4_test' } };
  assert.deepEqual(verifyLegacyFixtureTarget(ok), { ok: true });
  const refused = [
    { ...ok, env: { ...ok.env, NODE_ENV: 'production' } },
    { ...ok, databaseUrl: 'mysql://root:x@127.0.0.1:3306/ovenco_c4_test' },
    { ...ok, databaseUrl: 'mysql://root:x@db.example:33306/ovenco_c4_test' },
    { ...ok, databaseUrl: 'mysql://root:x@127.0.0.1:33306/ovenco', currentDatabase: 'ovenco' },
    { ...ok, currentDatabase: 'lain_test' },
    { ...ok, env: {} },
  ];
  for (const input of refused) assert.equal(verifyLegacyFixtureTarget(input).ok, false, JSON.stringify(input));
  assert.equal(isLegacyFixtureMaterial(material('100.00'), hasStockRecords), false);
  assert.equal(isLegacyFixtureMaterial({ ...material('100.00'), name: 'Bahan R18 x-1' }, hasStockRecords), true);
  assert.equal(isLegacyFixtureMaterial({ ...material('100.00', [opening(1, '100.00')]), name: 'Bahan R18 x-1' }, hasStockRecords), false);
});
