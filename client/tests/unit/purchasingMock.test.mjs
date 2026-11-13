// Uji CR-04a CP6 mode mock · FR-41 – FR-44 · UC-33 – UC-35 · BR-17 – BR-24, BR-30, BR-31, BR-35 · IT-38 — services
// purchasingService & stockService (dokumen stok) di mode mock = kontrak API CP4/CP5. Tanpa fetch.
// Alur: supplier → PO (nomor, nilai) → pesan → terima sebagian/penuh/berlebih → batal → pembalik/koreksi; dokumen stok
// AD-07 (stok masuk, opname, pembalik/koreksi, riwayat); idempotensi request_id (replay, 409 REUSED); rollback (tanpa
// tulis parsial); IT-38: saldo awal untuk tabel bahan lama di localStorage (K-C) dan pembuatan ulang bila K-D.
// Buku mutasi hasil mock diperiksa dengan aturan SERVER (ledgerRules.checkMaterialLedger) — mock = API.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };

const require = createRequire(import.meta.url);
const { checkMaterialLedger } = require('../../../server/src/services/ledgerRules.service.js');
const P = await import('../../src/services/purchasingService.js');
const S = await import('../../src/services/stockService.js');
const { getTables, updateTable } = await import('../../src/services/mock/db.js');
const { loadLedgerTables } = await import('../../src/services/mock/ledgerMock.js');
const { getMockTodayKey } = await import('../../src/services/mock/mockClock.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const as = (role) => useAuthStore.setState({ user: { user_id: role === 'customer' ? 7 : 3, role }, token: `mock_token_${role}` });
const failOf = async (promise) => promise.then(() => assert.fail('harus gagal'), (err) => err);
let seq = 0;
const rid = () => `9a8b7c6d-5e4f-4a3b-8c2d-${String((seq += 1)).padStart(12, '0')}`;

/** Buku mutasi mock dalam bentuk server → aturan SERVER */
function serverLedgerViolations() {
  const t = loadLedgerTables();
  const items = new Map(t.purchase_order_items.map((i) => [String(i.po_item_id), i]));
  const receipts = new Map(t.goods_receipts.map((r) => [String(r.receipt_id), r]));
  return t.raw_materials.flatMap((m) => checkMaterialLedger({
    materialId: String(m.material_id), name: m.name, stock: String(m.stock),
    adjustments: t.stock_adjustments.filter((a) => a.material_id === m.material_id).map((a) => ({
      adjustmentId: String(a.adjustment_id), kind: a.kind, qty: a.qty, countedStock: a.counted_stock, systemStock: a.system_stock,
      openingMaterialId: a.opening_material_id == null ? null : String(a.opening_material_id), operationRequestId: a.operation_request_id, createdAt: a.created_at,
    })),
    movements: t.material_movements.filter((v) => v.material_id === m.material_id).map((v) => ({
      movementId: String(v.movement_id), materialId: String(v.material_id), type: v.type, qtyChange: v.qty_change, stockBefore: v.stock_before, stockAfter: v.stock_after,
      adjustmentId: v.adjustment_id == null ? null : String(v.adjustment_id), receiptId: v.receipt_id == null ? null : String(v.receipt_id),
      poItemId: v.po_item_id == null ? null : String(v.po_item_id), createdAt: v.created_at,
    })),
    receiptLines: t.goods_receipt_lines.filter((l) => items.get(String(l.po_item_id))?.material_id === m.material_id).map((l) => ({
      receiptId: String(l.receipt_id), poItemId: String(l.po_item_id), qty: l.qty, kind: receipts.get(String(l.receipt_id)).kind,
      operationRequestId: receipts.get(String(l.receipt_id)).operation_request_id, createdAt: receipts.get(String(l.receipt_id)).created_at,
    })),
  }).map((v) => `${m.material_id} ${v.invariant} ${v.message}`));
}
const supplierBody = (extra = {}) => ({ name: 'Toko Tepung', phone: '+6281234567890', address: 'Jl. Gandum 2', email: 'toko@contoh.id', contact_person: 'Budi', material_ids: ['1', '2'], ...extra });
const stockOf = (id) => getTables('raw_materials').raw_materials.find((m) => m.material_id === id).stock;

test.beforeEach(() => { store.clear(); fetchCalls = 0; as('staf'); });
test.after(() => assert.equal(fetchCalls, 0));

test('IT-38: saldo awal mock untuk setiap bahan (stok 0 tanpa mutasi); tabel bahan lama tanpa buku mutasi (K-C) diperbaiki; K-D → dibuat ulang', async () => {
  await S.getRawMaterials();
  const t = getTables('stock_adjustments', 'material_movements', 'raw_materials');
  assert.equal(t.stock_adjustments.filter((d) => d.kind === 'saldo_awal').length, t.raw_materials.length);
  assert.deepEqual(serverLedgerViolations(), []);
  // Perangkat lama: bahan tambahan buatan admin tanpa dokumen apa pun → K-C → saldo awal dari stok saat ini
  updateTable('raw_materials', (rows) => [...rows, { material_id: 1001, name: 'Kayu manis', unit: 'g', stock: 12.5, min_stock: 1 }, { material_id: 1002, name: 'Vanili', unit: 'g', stock: 0, min_stock: 0 }]);
  await S.getRawMaterials();
  const docs = getTables('stock_adjustments').stock_adjustments.filter((d) => d.material_id >= 1001);
  assert.deepEqual(docs.map((d) => [d.material_id, d.qty]), [[1001, '12.50'], [1002, '0.00']]);
  assert.equal(getTables('material_movements').material_movements.filter((m) => m.material_id === 1002).length, 0);
  assert.deepEqual(serverLedgerViolations(), []);
  // K-D: mutasi tanpa saldo awal → data bahan & buku mutasi dibuat ulang dari seed
  updateTable('stock_adjustments', (rows) => rows.filter((d) => d.material_id !== 1001));
  const error = console.error;
  console.error = () => {};
  try { await S.getRawMaterials(); } finally { console.error = error; }
  assert.equal(getTables('raw_materials').raw_materials.some((m) => m.material_id === 1001), false);
  assert.deepEqual(serverLedgerViolations(), []);
});

test('supplier: buat, nama unik, ubah daftar bahan, nonaktif; replay request_id identik & 409 REUSED; pelanggan ditolak', async () => {
  const id = rid();
  const created = await P.saveSupplier(null, supplierBody(), id);
  assert.deepEqual([created.supplier_id, created.is_active, created.materials.map((m) => m.material_id)], ['1', true, ['1', '2']]);
  assert.deepEqual(await P.saveSupplier(null, supplierBody({ material_ids: ['2', '1'] }), id), created, 'payload kanonik sama → replay');
  assert.equal((await failOf(P.saveSupplier(null, supplierBody({ contact_person: 'Lain' }), id))).code, 'REQUEST_ID_REUSED');
  assert.equal(getTables('suppliers').suppliers.length, 1);
  assert.deepEqual((await failOf(P.saveSupplier(null, supplierBody({ name: 'TOKO TEPUNG' }), rid()))).fieldErrors, { name: 'Nama supplier sudah dipakai.' });
  const bad = await failOf(P.saveSupplier(null, supplierBody({ phone: '0812', email: 'x@', material_ids: ['999'] }), rid()));
  assert.deepEqual([bad.status, Object.keys(bad.fieldErrors).sort()], [400, ['email', 'material_ids.0', 'phone']]);
  const updated = await P.saveSupplier('1', supplierBody({ material_ids: ['3'], note: 'langganan' }));
  assert.deepEqual([updated.materials.map((m) => m.material_id), updated.note], [['3'], 'langganan']);
  assert.equal((await P.setSupplierActive('1', false)).is_active, false);
  assert.equal((await P.getSuppliers()).length, 1, 'tidak dihapus');
  as('customer');
  await failOf(P.getSuppliers());
});

test('PO & penerimaan: nomor, nilai per baris, pesan, sebagian → penuh, berlebih 409, batal, pembalik & koreksi; buku mutasi = aturan server', async () => {
  const sup = await P.saveSupplier(null, supplierBody({ material_ids: ['1', '2', '3'] }), rid());
  const items = [{ material_id: '1', qty_ordered: '0.33', unit_price: '0.15' }, { material_id: '2', qty_ordered: '0.33', unit_price: '0.15' }];
  let po = await P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items }, rid());
  const key = getMockTodayKey();
  assert.equal(po.po_number, `PO-${key.slice(2, 4)}${key.slice(5, 7)}${key.slice(8, 10)}-001`);
  assert.deepEqual([po.status, po.items.map((i) => i.line_value), po.values.order_value], ['draft', [0.05, 0.05], 0.1]);
  assert.equal((await failOf(P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items: [{ material_id: '4', qty_ordered: '1', unit_price: '1' }] }, rid()))).status, 400);
  po = await P.savePurchaseOrder(po.po_id, { supplier_id: sup.supplier_id, items: [{ material_id: '1', qty_ordered: '5', unit_price: '2500.50' }, { material_id: '3', qty_ordered: '2', unit_price: '100' }] });
  po = await P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, rid());
  assert.equal(po.status, 'dipesan');
  assert.equal((await failOf(P.savePurchaseOrder(po.po_id, { supplier_id: sup.supplier_id, items }))).status, 409);
  const [flour, sugar] = [po.items.find((i) => i.material_id === '1').po_item_id, po.items.find((i) => i.material_id === '3').po_item_id];
  const before = stockOf(1);
  const receiptId = rid();
  const first = await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: flour, qty: '3' }] }, receiptId);
  assert.deepEqual([first.purchase_order.status, first.purchase_order.values.received_value, stockOf(1)], ['diterima_sebagian', 7501.5, before + 3]);
  assert.deepEqual(await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: flour, qty: '3.00' }] }, receiptId), first, 'replay tidak menggandakan');
  assert.equal(stockOf(1), before + 3);
  const tablesBefore = JSON.stringify(getTables('goods_receipts', 'material_movements', 'raw_materials'));
  assert.equal((await failOf(P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: flour, qty: '2.01' }] }, rid()))).status, 409);
  assert.equal(JSON.stringify(getTables('goods_receipts', 'material_movements', 'raw_materials')), tablesBefore, 'tanpa tulis parsial');
  const full = await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: flour, qty: '2' }, { po_item_id: sugar, qty: '2' }] }, rid());
  assert.equal(full.purchase_order.status, 'diterima');
  // Koreksi penerimaan penuh: tepung 2 → 1 (rujuk P), gula 2 → dihapus (rujuk R)
  const corrected = await P.reverseOrCorrectReceipt(full.receipt_id, { lines: [{ po_item_id: flour, qty: '1' }], reason: 'salah hitung' }, rid(), { correct: true });
  assert.deepEqual(corrected.movements.map((m) => m.qty_change), ['-1.00', '-2.00']);
  assert.equal(corrected.purchase_order.status, 'diterima_sebagian');
  assert.equal((await failOf(P.reverseOrCorrectReceipt(full.receipt_id, { reason: 'ulang' }, rid(), { correct: false }))).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  const cancelled = await P.changePurchaseOrderStatus(po.po_id, { from: 'diterima_sebagian', to: 'dibatalkan', cancel_reason: 'tutup' }, rid());
  assert.deepEqual([cancelled.status, cancelled.items.map((i) => i.qty_cancelled), cancelled.values.cancelled_value], ['dibatalkan', [1, 2], 2700.5]);
  const reversed = await P.reverseOrCorrectReceipt(first.receipt_id, { reason: 'retur' }, rid(), { correct: false });
  assert.deepEqual([reversed.purchase_order.status, reversed.purchase_order.values.cancelled_value], ['dibatalkan', 2700.5]);
  assert.deepEqual(serverLedgerViolations(), []);
  assert.equal((await P.getPurchaseOrders())[0].po_id, po.po_id);
});

test('AD-07 dokumen stok: stok masuk, opname (selisih 0 tanpa mutasi, expected basi 409), pembalik/koreksi stok masuk, saldo < 0 → 409, riwayat', async () => {
  const material = (await S.getRawMaterials()).rows.find((m) => m.material_id === 2); // Butter 6.5
  await S.recordStockIn(2, '10', rid());
  const docId = getTables('stock_adjustments').stock_adjustments.filter((d) => d.kind === 'stok_masuk').at(-1).adjustment_id;
  assert.equal(stockOf(2), material.stock + 10);
  assert.equal((await S.countStock(2, { counted_stock: '16.50', expected_stock: '16.50', reason: null }, rid())).movement, null);
  assert.equal((await failOf(S.countStock(2, { counted_stock: '1', expected_stock: '6.50', reason: null }, rid()))).code, 'STOCK_CHANGED');
  const corrected = await S.reverseOrCorrectStockInDocument(docId, { qty: '8', reason: 'salah ketik' }, rid(), { correct: true });
  assert.deepEqual([corrected.movement.qty_change, stockOf(2)], ['-2.00', 14.5]);
  await S.countStock(2, { counted_stock: '1', expected_stock: '14.50', reason: 'rusak' }, rid());
  const replacement = corrected.replacement_id;
  assert.equal((await failOf(S.reverseOrCorrectStockInDocument(replacement, { reason: 'batal' }, rid(), { correct: false }))).code, 'STOCK_OUT_OF_RANGE');
  const history = await S.getMaterialMovements(2);
  assert.deepEqual(history.movements.map((m) => m.type), ['saldo_awal', 'stok_masuk', 'koreksi_stok_masuk', 'stock_opname']);
  // CP6: dokumen stok di riwayat membawa qty & effective (= server adminStockDocument.getMaterialMovements)
  assert.deepEqual(history.movements.map((m) => [m.document.kind, m.document.qty, m.document.effective]),
    [['saldo_awal', 6.5, true], ['stok_masuk', 10, false], ['pengganti_stok_masuk', 8, true], ['stock_opname', null, true]]);
  const created = await S.saveMaterial(null, { name: 'Garam', unit: 'kg', stock: '2.5', min_stock: '1' }, rid());
  assert.deepEqual(getTables('stock_adjustments').stock_adjustments.filter((d) => d.material_id === created.material_id).map((d) => [d.kind, d.qty]), [['saldo_awal', '2.50']]);
  assert.deepEqual(serverLedgerViolations(), []);
});

test('mock = validator & middleware server: body ketat, desimal teks, alasan, request_id wajib/format (400 tanpa tulis)', async () => {
  as('staf');
  const before = JSON.stringify(loadLedgerTables());
  const cases = [
    [() => S.countStock(2, { counted_stock: '1', expected_stock: '1' }), 'request_id wajib diisi.'],
    [() => S.countStock(2, { counted_stock: '1', expected_stock: '1' }, 'BUKAN-UUID'), 'request_id harus UUID v4 huruf kecil.'],
    [() => S.countStock(2, { counted_stock: '1.234', expected_stock: '1' }, rid()), null],
    [() => S.countStock(2, { counted_stock: 1, expected_stock: '1' }, rid()), null],
    [() => S.countStock(2, { counted_stock: '1', expected_stock: '1', extra: 1 }, rid()), 'Data tidak valid.'],
    [() => S.reverseOrCorrectStockInDocument(1, {}, rid(), { correct: false }), 'Alasan wajib diisi.'],
    [() => S.reverseOrCorrectStockInDocument(1, { qty: '0', reason: 'x' }, rid(), { correct: true }), null],
    [() => S.reverseOrCorrectStockInDocument(1, { reason: 'x'.repeat(256) }, rid(), { correct: false }), null],
    [() => P.receivePurchaseOrder('1', { lines: [{ po_item_id: '1', qty: '1' }] }), 'request_id wajib diisi.'],
  ];
  for (const [call, message] of cases) {
    const err = await failOf(call());
    assert.equal(err.status, 400, String(call));
    if (message) assert.equal(err.message, message);
  }
  assert.equal(JSON.stringify(loadLedgerTables()), before);
});
