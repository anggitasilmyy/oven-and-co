// Uji CR-04b mode mock · FR-45, FR-46 · UC-36, UC-37 · BR-23 – BR-31, BR-36 — services/workOrderService di mode mock = kontrak
// API CR-04b (tests-mysql/26): WO (validasi, nomor, ubah Draft, transisi, snapshot resep termasuk kosong, plan-source hanya
// baca), pengeluaran (stok tepat sekali, saldo ≥ 0 → 409, replay & REUSED), koreksi multi-bahan rujuk P/R (IT-21), selesai
// satu dokumen normal (+ pengeluaran terakhir), tiga kasus koreksi hasil + terminal (IT-22), standar/aktual/selisih eksak
// (IT-23), K13 (rencana stok & pesanan tidak berubah). Buku mutasi mock diperiksa dengan aturan SERVER. Tanpa fetch.

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
globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const require = createRequire(import.meta.url);
const { checkMaterialLedger } = require('../../../server/src/services/ledgerRules.service.js');
const W = await import('../../src/services/workOrderService.js');
const S = await import('../../src/services/stockService.js');
const { getTables } = await import('../../src/services/mock/db.js');
const { loadLedgerTables } = await import('../../src/services/mock/ledgerMock.js');
const { getMockTodayKey } = await import('../../src/services/mock/mockClock.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const as = (role) => useAuthStore.setState({ user: { user_id: role === 'customer' ? 7 : 3, role }, token: `mock_token_${role}` });
const failOf = async (promise) => promise.then(() => assert.fail('harus gagal'), (err) => err);
let seq = 0;
const rid = () => `6c6c6c6c-0000-4000-8000-${String((seq += 1)).padStart(12, '0')}`;
const stockOf = (id) => getTables('raw_materials').raw_materials.find((m) => m.material_id === Number(id)).stock;
const T = () => getMockTodayKey();

function serverLedgerViolations() {
  const t = loadLedgerTables();
  const items = new Map(t.purchase_order_items.map((i) => [String(i.po_item_id), i]));
  const receipts = new Map(t.goods_receipts.map((r) => [String(r.receipt_id), r]));
  const issues = new Map(t.material_issues.map((d) => [String(d.issue_id), d]));
  return t.raw_materials.flatMap((m) => checkMaterialLedger({
    materialId: String(m.material_id), name: m.name, stock: String(m.stock),
    adjustments: t.stock_adjustments.filter((a) => a.material_id === m.material_id).map((a) => ({
      adjustmentId: String(a.adjustment_id), kind: a.kind, qty: a.qty, countedStock: a.counted_stock, systemStock: a.system_stock,
      openingMaterialId: a.opening_material_id == null ? null : String(a.opening_material_id), operationRequestId: a.operation_request_id, createdAt: a.created_at,
    })),
    movements: t.material_movements.filter((v) => v.material_id === m.material_id).map((v) => ({
      movementId: String(v.movement_id), materialId: String(v.material_id), type: v.type, qtyChange: v.qty_change, stockBefore: v.stock_before, stockAfter: v.stock_after,
      adjustmentId: v.adjustment_id == null ? null : String(v.adjustment_id), receiptId: v.receipt_id == null ? null : String(v.receipt_id),
      poItemId: v.po_item_id == null ? null : String(v.po_item_id), issueId: v.issue_id == null ? null : String(v.issue_id), createdAt: v.created_at,
    })),
    receiptLines: t.goods_receipt_lines.filter((l) => items.get(String(l.po_item_id))?.material_id === m.material_id).map((l) => ({
      receiptId: String(l.receipt_id), poItemId: String(l.po_item_id), qty: l.qty, kind: receipts.get(String(l.receipt_id)).kind,
      operationRequestId: receipts.get(String(l.receipt_id)).operation_request_id, createdAt: receipts.get(String(l.receipt_id)).created_at,
    })),
    issueLines: t.material_issue_lines.filter((l) => l.material_id === m.material_id).map((l) => {
      const d = issues.get(String(l.issue_id));
      return { issueId: String(l.issue_id), woId: String(d.wo_id), qty: l.qty, kind: d.kind, operationRequestId: d.operation_request_id, createdAt: d.created_at };
    }),
  }).map((v) => `${m.material_id} ${v.invariant} ${v.message}`));
}
const salesPrint = () => JSON.stringify(getTables('daily_stocks', 'orders', 'order_items', 'products'));
const start = async (w) => W.changeWorkOrderStatus(w.wo_id, { from: 'draft', to: 'diproses' }, rid());

test('WO: auth, request_id, validasi, nomor, ubah Draft, transisi; snapshot resep (kosong & berisi); plan-source hanya baca', async () => {
  useAuthStore.setState({ user: null, token: null });
  assert.equal((await failOf(W.getWorkOrders())).status, 401);
  as('customer');
  assert.equal((await failOf(W.getWorkOrders())).status, 403);
  as('staf');
  assert.equal((await failOf(W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 5 }))).message, 'request_id wajib diisi.');
  for (const bad of [{ qty_planned: 0 }, { qty_planned: 2.5 }, { production_date: '2000-01-01' }, { product_id: 11 }, { product_id: 999 }]) {
    assert.equal((await failOf(W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 5, ...bad }, rid()))).status, 400, JSON.stringify(bad));
  }
  const id = rid();
  const w = await W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 12, note: 'pagi' }, id);
  assert.match(w.wo_number, new RegExp(`^WO-${T().slice(2, 4)}${T().slice(5, 7)}${T().slice(8, 10)}-001$`));
  assert.deepEqual(await W.saveWorkOrder(null, { product_id: '1', production_date: T(), qty_planned: '12', note: 'pagi' }, id), w, 'replay identik');
  assert.equal((await failOf(W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 13 }, id))).code, 'REQUEST_ID_REUSED');
  assert.equal((await W.saveWorkOrder(w.wo_id, { product_id: 1, production_date: T(), qty_planned: 15 })).qty_planned, 15);
  assert.equal((await failOf(W.changeWorkOrderStatus(w.wo_id, { from: 'draft', to: 'selesai' }, rid()))).status, 409);
  const started = await start(w);
  assert.deepEqual([started.status, Boolean(started.recipe_snapshot_at), started.recipe.map((r) => [r.material_id, r.qty_per_unit])],
    ['diproses', true, [['1', 0.06], ['2', 0.015], ['3', 0.005], ['4', 0.1], ['6', 0.02], ['7', 1.5]]]);
  const noRecipe = await start(await W.saveWorkOrder(null, { product_id: 3, production_date: T(), qty_planned: 1 }, rid()));
  assert.deepEqual([noRecipe.recipe, Boolean(noRecipe.recipe_snapshot_at), noRecipe.without_recipe], [[], true, true]);
  const before = salesPrint();
  const source = await W.getPlanSource(T());
  assert.ok(source.active_work_orders.every((a) => ['draft', 'diproses'].includes(a.status)));
  assert.equal(source.active_work_orders.length, 2);
  assert.equal((await failOf(W.getPlanSource('2000-01-01'))).status, 400);
  assert.equal(salesPrint(), before, 'plan-source tidak menulis');
});

test('pengeluaran: stok tepat sekali, replay, saldo < 0 → 409 tanpa efek; koreksi multi-bahan (IT-21); batal setelah pengeluaran', async () => {
  as('staf');
  const w = await start(await W.saveWorkOrder(null, { product_id: 2, production_date: T(), qty_planned: 10 }, rid()));
  const [s1, s2, s3] = [stockOf(1), stockOf(2), stockOf(3)];
  const id = rid();
  const first = await W.issueMaterials(w.wo_id, { lines: [{ material_id: '2', qty: '1' }, { material_id: '1', qty: '10' }, { material_id: '3', qty: '0.5' }] }, id);
  assert.deepEqual(first.movements.map((m) => [m.type, m.qty_change]), [['pengeluaran_produksi', '-10.00'], ['pengeluaran_produksi', '-1.00'], ['pengeluaran_produksi', '-0.50']]);
  assert.deepEqual(await W.issueMaterials(w.wo_id, { lines: [{ material_id: 1, qty: '10.00' }, { material_id: 2, qty: '1.0' }, { material_id: 3, qty: '0.50' }] }, id), first);
  assert.deepEqual([stockOf(1), stockOf(2), stockOf(3)], [s1 - 10, s2 - 1, s3 - 0.5]);
  const snap = JSON.stringify(loadLedgerTables());
  assert.equal((await failOf(W.issueMaterials(w.wo_id, { lines: [{ material_id: '1', qty: String(s1) }] }, rid()))).code, 'STOCK_OUT_OF_RANGE');
  for (const lines of [[], [{ material_id: '1', qty: 1 }], [{ material_id: '999', qty: '1' }], [{ material_id: '1', qty: '1' }, { material_id: '1', qty: '2' }]]) {
    assert.equal((await failOf(W.issueMaterials(w.wo_id, { lines }, rid()))).status, 400, JSON.stringify(lines));
  }
  assert.equal(JSON.stringify(loadLedgerTables()), snap, 'penolakan tanpa efek');
  const corr = await W.reverseOrCorrectIssue(first.issue_id, { lines: [{ material_id: '1', qty: '8' }, { material_id: '3', qty: '0.5' }], reason: 'salah timbang' }, rid(), { correct: true });
  assert.deepEqual(corr.movements.map((m) => [m.qty_change]), [['2.00'], ['1.00']], 'tepung +2 (P), mentega +1 (R), bahan sama tanpa mutasi');
  assert.equal((await failOf(W.reverseOrCorrectIssue(first.issue_id, { reason: 'x' }, rid(), { correct: false }))).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  const cancelled = await W.changeWorkOrderStatus(w.wo_id, { from: 'diproses', to: 'dibatalkan' }, rid());
  assert.deepEqual([cancelled.status, cancelled.outputs.length, cancelled.usage.find((u) => u.material_id === '1').actual], ['dibatalkan', 0, 8]);
  assert.equal((await failOf(W.issueMaterials(w.wo_id, { lines: [{ material_id: '1', qty: '1' }] }, rid()))).status, 409);
  await W.reverseOrCorrectIssue(corr.replacement_id, { reason: 'kembali' }, rid(), { correct: false });
  assert.deepEqual([stockOf(1), stockOf(3)], [s1, s3]);
  assert.deepEqual(serverLedgerViolations(), []);
});

test('selesai & hasil: satu dokumen normal (+ pengeluaran terakhir), kedua 409; IT-22 tiga kasus + terminal; IT-23 eksak; K13', async () => {
  as('staf');
  const w = await start(await W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 10 }, rid()));
  const before = salesPrint();
  assert.equal((await failOf(W.completeWorkOrder(w.wo_id, { qty_output: 10001 }, rid()))).status, 400);
  const done = await W.completeWorkOrder(w.wo_id, { qty_output: 7, lines: [{ material_id: '2', qty: '0.10' }] }, rid());
  assert.deepEqual([done.work_order.status, done.work_order.net_output, done.movements.length], ['selesai', 7, 1]);
  assert.deepEqual(done.work_order.usage.find((u) => u.material_id === '2'), { material_id: '2', name: done.work_order.usage.find((u) => u.material_id === '2').name,
    unit: 'kg', in_recipe: true, standard: 0.105, actual: 0.1, variance: -0.005 });
  assert.equal((await failOf(W.completeWorkOrder(w.wo_id, { qty_output: 7 }, rid()))).status, 409);
  assert.equal(salesPrint(), before, 'hasil tidak menulis stok jual / pesanan / produk (K13)');

  const z = await start(await W.saveWorkOrder(null, { product_id: 1, production_date: T(), qty_planned: 5 }, rid()));
  const o0 = (await W.completeWorkOrder(z.wo_id, { qty_output: 0 }, rid())).output_id;
  assert.equal((await failOf(W.reverseOrCorrectOutput(o0, { reason: 'x' }, rid(), { correct: false }))).status, 400);
  const c1 = await W.reverseOrCorrectOutput(o0, { qty_output: 5, reason: 'r' }, rid(), { correct: true });
  assert.deepEqual([c1.reversal_id, c1.work_order.net_output], [null, 5]);
  const c2 = await W.reverseOrCorrectOutput(c1.replacement_id, { qty_output: 8, reason: 'r' }, rid(), { correct: true });
  assert.deepEqual([Boolean(c2.reversal_id), c2.work_order.net_output], [true, 8]);
  assert.equal((await failOf(W.reverseOrCorrectOutput(c2.replacement_id, { qty_output: 8, reason: 'r' }, rid(), { correct: true }))).status, 400);
  const c3 = await W.reverseOrCorrectOutput(c2.replacement_id, { qty_output: 0, reason: 'r' }, rid(), { correct: true });
  assert.deepEqual([c3.replacement_id, c3.work_order.net_output, c3.work_order.status], [null, 0, 'selesai']);
  for (const id of [o0, c1.replacement_id, c2.replacement_id, c3.reversal_id]) {
    assert.equal((await failOf(W.reverseOrCorrectOutput(id, { qty_output: 3, reason: 'x' }, rid(), { correct: true }))).code, 'DOCUMENT_ALREADY_SUPERSEDED');
  }
  assert.deepEqual(serverLedgerViolations(), []);
  const history = await S.getMaterialMovements(2);
  assert.ok(history.movements.some((m) => m.type === 'pengeluaran_produksi' && m.document.source === 'material_issue'));
});
