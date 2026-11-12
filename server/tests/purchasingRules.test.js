// CR-04a CP3 · FR-41 – FR-44 · BR-17 – BR-24, BR-30, BR-31, BR-35 — aturan murni pembelian & buku mutasi:
// input desimal, nilai pembelian (pembulatan per baris), supplier, PO & transisi, penerimaan sebagian/penuh/berlebih,
// pembalik & koreksi (dampak bersih, rujukan P/R), saldo akhir [0, batas], stock opname, idempotensi.
// Client setara diuji silang di client/tests/vitest/purchasingRules.test.mjs dengan fixture yang sama.

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/services/decimalInputRules.service');
const V = require('../src/services/purchaseValueRules.service');
const P = require('../src/services/purchasingRules.service');
const L = require('../src/services/stockLedgerRules.service');
const I = require('../src/services/idempotencyRules.service');
const F = require('./helpers/purchasingFixtures');

const MATERIALS = new Set(['1', '2', '3']);
const SUPPLIER = { supplierActive: true, supplierMaterialIds: new Set(['1', '3']) };
const item = (id, ordered, received = '0', cancelled = '0', material = id) => [String(id), { po_item_id: String(id), material_id: String(material), qty_ordered: ordered, net_received: received, qty_cancelled: cancelled }];

test('input desimal: teks ≤ 2 desimal, > 0 (atau ≥ 0), ≤ batas; JSON number & eksponen ditolak', () => {
  for (const [value, options, expected] of F.DECIMAL_CASES) {
    const r = D.parseDecimalInput(value, options);
    assert.equal(r.error ?? String(r.cents), expected, JSON.stringify(value));
  }
  assert.equal(D.centsToDecimalString(-200n), '-2.00');
  assert.equal(D.decimalToCents('99999999.99'), 9999999999n);
});

test('nilai pembelian: round setengah menjauhi nol per baris, pembalik tepat negatif, batas nilai PO', () => {
  for (const [qty, price, expected] of F.VALUE_CASES) assert.equal(D.centsToDecimalString(V.lineValueCents(qty, price)), expected, `${qty}×${price}`);
  const po = V.purchaseOrderValue([{ qty_ordered: '0.33', unit_price: '0.15' }, { qty_ordered: '0.33', unit_price: '0.15' }]);
  assert.deepEqual(po, { lines: ['0.05', '0.05'], total: '0.10', exceeds: false }); // per baris, bukan 0,099 → 0,10 dari total
  assert.equal(V.receiptValue([{ qty_change: '2.25', unit_price: '33333.33' }, { qty_change: '-2.25', unit_price: '33333.33' }]), '0.00');
  assert.equal(V.cancelledValue([{ qty_cancelled: '1.50', unit_price: '1000' }]), '1500.00');
  assert.equal(V.purchaseOrderValue([{ qty_ordered: '99999999.99', unit_price: '9999999999.99' }]).exceeds, true);
});

test('supplier: field wajib T-01, catatan opsional, telepon +62, email, daftar bahan dari master tanpa duplikat', () => {
  const ok = P.validateSupplier(F.SUPPLIER_OK, MATERIALS);
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, { name: 'Toko Tepung', phone: '+628123456789', address: 'Jl. Mawar 1', email: 'toko@contoh.id', contact_person: 'Ani', note: null, material_ids: ['1', '3'] });
  assert.deepEqual(P.validateSupplier({ ...F.SUPPLIER_OK, material_ids: undefined }, MATERIALS).errors, {}, 'daftar bahan boleh kosong');
  const bad = P.validateSupplier({ name: ' ', phone: '0812', address: '', email: 'x@', contact_person: 'a'.repeat(101), note: 'n'.repeat(256), material_ids: ['1', '1', '9'] }, MATERIALS);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['address', 'contact_person', 'email', 'material_ids.1', 'material_ids.2', 'name', 'note', 'phone']);
});

test('PO: supplier aktif & berbahan, 1 – 30 item, bahan terdaftar sekali, qty/harga teks desimal', () => {
  const ok = P.validatePurchaseOrderItems([{ material_id: '3', qty_ordered: '5', unit_price: '15000' }, { material_id: 1, qty_ordered: '2.5', unit_price: '0.5' }], SUPPLIER);
  assert.deepEqual(ok, { errors: {}, value: [{ material_id: '1', qty_ordered: '2.50', unit_price: '0.50' }, { material_id: '3', qty_ordered: '5.00', unit_price: '15000.00' }] });
  assert.equal(P.validatePurchaseOrderItems([{ material_id: '1', qty_ordered: '1', unit_price: '1' }], { ...SUPPLIER, supplierActive: false }).errors.supplier_id, 'Supplier tidak aktif.');
  assert.equal(P.validatePurchaseOrderItems([{}], { supplierActive: true, supplierMaterialIds: new Set() }).errors.supplier_id, 'Supplier belum punya daftar bahan.');
  assert.equal(P.validatePurchaseOrderItems([], SUPPLIER).errors.items, 'Minimal 1 item.');
  assert.equal(P.validatePurchaseOrderItems(Array.from({ length: 31 }, () => ({})), SUPPLIER).errors.items, 'Maksimal 30 item per PO.');
  const bad = P.validatePurchaseOrderItems([{ material_id: '2', qty_ordered: 5, unit_price: '1.001' }, { material_id: '1', qty_ordered: '1', unit_price: '1' }, { material_id: '1', qty_ordered: '0', unit_price: '1' }], SUPPLIER);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['items.0.material_id', 'items.0.qty_ordered', 'items.0.unit_price', 'items.2.material_id', 'items.2.qty_ordered']);
});

test('transisi PO {from, to}: pesan dari Draft; batal dari Draft/Dipesan/Diterima Sebagian; final tidak berubah', () => {
  assert.equal(P.purchaseOrderTransitionError('draft', 'draft', 'dipesan'), null);
  assert.equal(P.purchaseOrderTransitionError('diterima_sebagian', 'diterima_sebagian', 'dibatalkan'), null);
  assert.equal(P.purchaseOrderTransitionError('dipesan', 'draft', 'dipesan').status, 409, 'status basi');
  for (const [from, to] of [['dipesan', 'diterima'], ['diterima', 'dibatalkan'], ['dibatalkan', 'draft'], ['draft', 'diterima_sebagian']]) {
    assert.equal(P.purchaseOrderTransitionError(from, from, to).status, 409, `${from}→${to}`);
  }
});

test('penerimaan sebagian berulang, penuh, berlebih ditolak; status dari jumlah bersih diterima', () => {
  const items = new Map([item(10, '5'), item(11, '2')]);
  const first = P.validateReceiptLines('dipesan', items, [{ po_item_id: '10', qty: '3' }]);
  assert.deepEqual(first, { status: 200, value: [{ po_item_id: '10', material_id: '10', qty: '3.00' }] });
  assert.equal(P.purchaseOrderStatusFromReceipts('dipesan', [...new Map([item(10, '5', '3'), item(11, '2')]).values()]), 'diterima_sebagian');
  const partial = new Map([item(10, '5', '3'), item(11, '2')]);
  assert.equal(P.validateReceiptLines('diterima_sebagian', partial, [{ po_item_id: '10', qty: '2.01' }]).status, 409, 'berlebih');
  assert.equal(P.validateReceiptLines('diterima_sebagian', partial, [{ po_item_id: '10', qty: '2' }, { po_item_id: '11', qty: '2' }]).status, 200);
  assert.equal(P.purchaseOrderStatusFromReceipts('diterima_sebagian', [...new Map([item(10, '5', '5'), item(11, '2', '2')]).values()]), 'diterima');
  assert.equal(P.purchaseOrderStatusFromReceipts('diterima_sebagian', [...new Map([item(10, '5', '0'), item(11, '2', '0')]).values()]), 'dipesan', 'setelah pembalik');
  assert.equal(P.purchaseOrderStatusFromReceipts('dibatalkan', [...partial.values()]), 'dibatalkan');
  assert.equal(P.validateReceiptLines('draft', items, [{ po_item_id: '10', qty: '1' }]).status, 409);
  assert.equal(P.validateReceiptLines('dipesan', items, []).status, 400);
  assert.deepEqual(Object.keys(P.validateReceiptLines('dipesan', items, [{ po_item_id: '99', qty: '1' }, { po_item_id: '10', qty: '0' }]).errors), ['lines.0.po_item_id', 'lines.1.qty']);
  assert.deepEqual(P.cancellationQuantities([{ po_item_id: 10, qty_ordered: '5', net_received: '3' }]), [{ po_item_id: '10', qty_cancelled: '2.00' }]);
});

test('koreksi penerimaan: batas sisa tanpa O; PO Dibatalkan hanya boleh mengurangi', () => {
  const items = new Map([item(10, '5', '3'), item(11, '2', '0')]); // O = item 10 qty 3
  const O = [{ po_item_id: '10', qty: '3' }];
  assert.equal(P.validateReceiptCorrection('diterima_sebagian', items, O, [{ po_item_id: '10', qty: '5' }]).status, 200);
  assert.equal(P.validateReceiptCorrection('diterima_sebagian', items, O, [{ po_item_id: '10', qty: '5.01' }]).status, 409);
  const cancelled = new Map([item(10, '5', '3', '2'), item(11, '2', '0', '2')]);
  assert.equal(P.validateReceiptCorrection('dibatalkan', cancelled, O, [{ po_item_id: '10', qty: '2' }]).status, 200);
  assert.equal(P.validateReceiptCorrection('dibatalkan', cancelled, O, [{ po_item_id: '10', qty: '3.01' }]).status, 409);
  assert.equal(P.validateReceiptCorrection('dibatalkan', cancelled, O, [{ po_item_id: '11', qty: '1' }]).status, 409);
});

test('pembalik & koreksi: dokumen berlaku, dampak bersih per baris, rujukan P/R, Δ 0 tanpa mutasi', () => {
  assert.equal(L.reversalTargetError('goods_receipt', { kind: 'normal', reversed: false, replaced: false }), null);
  assert.equal(L.reversalTargetError('goods_receipt', { kind: 'normal', reversed: true, replaced: false }).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  assert.equal(L.reversalTargetError('goods_receipt', { kind: 'pembalik', reversed: false, replaced: false }).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  assert.equal(L.reversalTargetError('stock_adjustment', { kind: 'stock_opname', reversed: false, replaced: false }).status, 400);
  assert.equal(L.reversalTargetError('stock_adjustment', { kind: 'saldo_awal', reversed: false, replaced: false }).status, 400);
  // Contoh Draft §4.3: O tepung 10, gula 5; P tepung 9 → tepung −1 rujuk P, gula −5 rujuk R
  const O = [{ po_item_id: '21', material_id: '1', qty: '10' }, { po_item_id: '22', material_id: '3', qty: '5' }];
  const plan = L.planReversalOrCorrection('goods_receipt', O, [{ po_item_id: '21', material_id: '1', qty: '9' }]);
  assert.deepEqual(plan.map((r) => [r.material_id, String(r.delta), r.reference, r.type]), [['1', '-100', 'P', 'koreksi_penerimaan'], ['3', '-500', 'R', 'koreksi_penerimaan']]);
  assert.deepEqual(L.planReversalOrCorrection('goods_receipt', O, null).map((r) => [String(r.delta), r.reference, r.type]), [['-1000', 'R', 'pembalik_penerimaan'], ['-500', 'R', 'pembalik_penerimaan']]);
  assert.deepEqual(L.planReversalOrCorrection('goods_receipt', O, [...O]), [], 'isi sama → tanpa mutasi');
  const stockIn = L.planReversalOrCorrection('stock_adjustment', [{ material_id: '2', qty: '10' }], [{ material_id: '2', qty: '8' }]);
  assert.deepEqual(stockIn.map((r) => [String(r.delta), r.reference, r.type]), [['-200', 'P', 'koreksi_stok_masuk']]);
  assert.equal(L.correctionShapeError('goods_receipt', O, []).status, 400);
  assert.equal(L.correctionShapeError('stock_adjustment', [{ material_id: '2', qty: '10' }], [{ material_id: '3', qty: '1' }]).status, 400);
  assert.equal(P.reasonError('  '), 'Alasan wajib diisi.');
  assert.equal(P.reasonError('x'.repeat(256)), 'Maks. 255 karakter.');
  assert.equal(P.reasonError('salah input'), null);
});

test('saldo akhir: stok tidak boleh negatif atau melebihi batas — satu pelanggaran menolak seluruh operasi', () => {
  const stocks = new Map([['1', '9.00'], ['3', '2.00']]);
  const ok = L.applyStockDeltas(stocks, [{ material_id: '1', delta: -900n }, { material_id: '3', delta: 100n }]);
  assert.deepEqual(ok.movements.map((m) => [m.material_id, m.qty_change, m.stock_before, m.stock_after]), [['1', '-9.00', '9.00', '0.00'], ['3', '1.00', '2.00', '3.00']]);
  const negative = L.applyStockDeltas(stocks, [{ material_id: '1', delta: -901n }, { material_id: '3', delta: 100n }]);
  assert.deepEqual([negative.status, negative.code, negative.materials], [409, 'STOCK_OUT_OF_RANGE', ['1']]);
  const over = L.applyStockDeltas(new Map([['1', '99999999.99']]), [{ material_id: '1', delta: 1n }]);
  assert.deepEqual([over.status, over.materials], [409, ['1']]);
  const exact = L.applyStockDeltas(new Map([['1', '99999999.98']]), [{ material_id: '1', delta: 1n }]);
  assert.equal(exact.stocks.get('1'), '99999999.99');
});

test('stock opname: fisik 0 sah, selisih 0 tanpa mutasi, expected basi 409 STOCK_CHANGED, "5" = 5.00', () => {
  assert.deepEqual(L.validateStockCountInput({ counted_stock: '0', expected_stock: '5' }).value, { counted_stock: '0.00', expected_stock: '5.00' });
  assert.deepEqual(Object.keys(L.validateStockCountInput({ counted_stock: 3, expected_stock: '1.234' }).errors), ['counted_stock', 'expected_stock']);
  assert.equal(L.validateStockCountInput({ counted_stock: '-1', expected_stock: '' }).status, 400);
  assert.equal(L.planStockCount('5.00', '5', '5').movement, null);
  assert.deepEqual(L.planStockCount('5.00', '3.5', '5').movement, { type: 'stock_opname', qty_change: '-1.50', stock_before: '5.00', stock_after: '3.50' });
  assert.deepEqual(L.planStockCount('5.00', '0', '5.00').document, { system_stock: '5.00', counted_stock: '0.00' });
  assert.equal(L.planStockCount('5.00', '3', '4.99').code, 'STOCK_CHANGED');
});

test('idempotensi: allowlist wajib/opsional, UUID v4 kanonik, payload kanonik + SHA-256, replay vs REQUEST_ID_REUSED', () => {
  const id = '3b1f6c2e-8a4d-4f1b-9c2d-1a2b3c4d5e6f';
  assert.equal(I.requestIdPolicyError('receive_purchase_order', id), null);
  assert.equal(I.requestIdPolicyError('receive_purchase_order', undefined).status, 400);
  assert.equal(I.requestIdPolicyError('raw_material_stock_in', undefined), null, 'opsional tanpa request_id = perilaku lama');
  assert.equal(I.requestIdPolicyError('raw_material_stock_in', id.toUpperCase()).status, 400);
  assert.equal(I.requestIdPolicyError('raw_material_stock_in', '3b1f6c2e-8a4d-1f1b-9c2d-1a2b3c4d5e6f').status, 400, 'bukan v4');
  assert.equal(I.requestIdPolicyError(null, id).status, 400, 'di luar allowlist');
  assert.equal(I.requestIdPolicyError(null, undefined), null);
  const a = { lines: [{ po_item_id: '10', qty: '3.00' }], note: ' tiba pagi ', request_id: id };
  const b = { note: 'tiba pagi', lines: [{ qty: '3.00', po_item_id: '10' }] };
  assert.equal(I.canonicalJson(a), '{"lines":[{"po_item_id":"10","qty":"3.00"}],"note":"tiba pagi"}');
  assert.equal(I.payloadHash(a), I.payloadHash(b));
  assert.match(I.payloadHash(a), /^[0-9a-f]{64}$/);
  assert.notEqual(I.payloadHash(a), I.payloadHash({ ...b, lines: [{ po_item_id: '10', qty: '3.01' }] }));
  const stored = { actor_id: '7', operation: 'receive_purchase_order', target_type: 'purchase_order', target_id: '5', payload_hash: I.payloadHash(a), response_status: 201, response_body: { data: { receipt_id: '9' } } };
  assert.deepEqual(I.duplicateRequestDecision(stored, { ...stored, actor_id: 7n }), { action: 'replay', status: 201, body: stored.response_body, headers: { 'Idempotent-Replay': 'true' } });
  for (const change of [{ actor_id: '8' }, { operation: 'correct_goods_receipt' }, { target_id: '6' }, { payload_hash: 'x' }]) {
    assert.equal(I.duplicateRequestDecision(stored, { ...stored, ...change }).code, 'REQUEST_ID_REUSED');
  }
});
