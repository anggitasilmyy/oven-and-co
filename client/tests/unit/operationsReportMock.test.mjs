// Uji CR-04c mode mock · FR-47 · AC-47.1 – AC-47.4 · K16, K18, K19 — services/reportService.getOperationsReport di mode mock =
// kontrak API (tests-mysql/27): hanya Owner (401/403), periode AD-08 (400), agregat = dokumen sumber (pembelian dipesan,
// sisa dibatalkan, penerimaan & nilai, mutasi per jenis, pemakaian standar/aktual/selisih, hasil per WO, rencana vs hasil),
// omzet pembanding = laporan penjualan AD-08, laporan tidak menulis apa pun. Tanpa fetch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const R = await import('../../src/services/reportService.js');
const P = await import('../../src/services/purchasingService.js');
const S = await import('../../src/services/stockService.js');
const W = await import('../../src/services/workOrderService.js');
const RC = await import('../../src/services/recipeService.js');
const { getMockTodayKey } = await import('../../src/services/mock/mockClock.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const as = (role) => useAuthStore.setState({ user: { user_id: role === 'owner' ? 4 : 3, role }, token: `mock_token_${role}` });
const failOf = async (promise) => promise.then(() => assert.fail('harus gagal'), (err) => err);
let seq = 0;
const rid = () => `7d7d7d7d-0000-4000-8000-${String((seq += 1)).padStart(12, '0')}`;
const T = () => getMockTodayKey();
const today = () => R.getOperationsReport({ period: 'harian' });

test.beforeEach(() => { store.clear(); as('owner'); });

test('AC-47.1 / K18: hanya Owner — tanpa sesi 401, Staf & pelanggan 403; K16: periode tidak dikenal & rentang salah 400', async () => {
  useAuthStore.setState({ user: null, token: null });
  assert.equal((await failOf(today())).status, 401);
  as('staf');
  const staf = await failOf(today());
  assert.deepEqual([staf.status, staf.message], [403, 'Anda tidak memiliki izin untuk mengakses resource ini.']);
  as('customer');
  assert.equal((await failOf(today())).status, 403);
  as('owner');
  assert.deepEqual([(await failOf(R.getOperationsReport({ period: 'tahunan' }))).status], [400]);
  const bad = await failOf(R.getOperationsReport({ period: 'rentang', from: '2026-11-10', to: '2026-11-01' }));
  assert.deepEqual([bad.status, bad.message], [400, 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai']);
});

test('periode tanpa transaksi CR-04 → bagian kosong; analisis FR-40 hari ini apa adanya; omzet = AD-08', async () => {
  const r = await R.getOperationsReport({ period: 'rentang', from: '2026-01-01', to: '2026-01-07' });
  assert.deepEqual([r.purchases.ordered.rows, r.movements, r.usage, r.production, r.plan_vs_output], [[], [], [], [], []]);
  const sales = await R.getSalesReport({ period: 'rentang', from: '2026-01-01', to: '2026-01-07' });
  assert.deepEqual(r.revenue, { revenue: sales.kpi.revenue, transactions: sales.kpi.transactions });
  assert.deepEqual(r.analysis.requirements, await S.getMaterialRequirements(''), 'K19: estimasi FR-40 apa adanya');
});

test('AC-47.2: agregat hari ini = dokumen sumber (PO, batal, penerimaan bersih & nilai, mutasi, pemakaian, hasil, rencana); laporan tidak menulis', async () => {
  as('staf');
  const m = await S.saveMaterial(null, { name: 'Tepung Lap', unit: 'kg', stock: '10', min_stock: '1' }, rid());
  const sup = await P.saveSupplier(null, { name: 'Sup Lap', phone: '+6281234567890', address: 'Jl. 1', email: 'a@b.id', contact_person: 'S', material_ids: [m.material_id] }, rid());
  const po = await P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items: [{ material_id: m.material_id, qty_ordered: '10', unit_price: '1500.55' }] }, rid());
  await P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, rid());
  const item = (await P.getPurchaseOrder(po.po_id)).items[0].po_item_id;
  await P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: item, qty: '4' }] }, rid());
  const rec = (await P.getPurchaseOrder(po.po_id)).receipts[0].receipt_id;
  await P.reverseOrCorrectReceipt(rec, { lines: [{ po_item_id: item, qty: '3' }], reason: 'salah' }, rid(), { correct: true });
  await P.changePurchaseOrderStatus(po.po_id, { from: 'diterima_sebagian', to: 'dibatalkan' }, rid());
  const product = (await (await import('../../src/services/adminProductService.js')).getAdminProducts()).rows.find((p) => p.name === 'Classic Butter Croissant');
  await RC.saveProductRecipe(product.product_id, [{ material_id: String(m.material_id), qty_per_unit: '0.015' }]);
  const wo = await W.saveWorkOrder(null, { product_id: String(product.product_id), production_date: T(), qty_planned: 9 }, rid());
  await W.changeWorkOrderStatus(wo.wo_id, { from: 'draft', to: 'diproses' }, rid());
  await W.issueMaterials(wo.wo_id, { lines: [{ material_id: String(m.material_id), qty: '0.10' }] }, rid());
  const done = await W.completeWorkOrder(wo.wo_id, { qty_output: 5 }, rid());
  await W.reverseOrCorrectOutput(done.output_id, { qty_output: 7, reason: 'hitung ulang' }, rid(), { correct: true });
  const cancelled = await W.saveWorkOrder(null, { product_id: String(product.product_id), production_date: T(), qty_planned: 4 }, rid());
  await W.changeWorkOrderStatus(cancelled.wo_id, { from: 'draft', to: 'dibatalkan' }, rid());

  as('owner');
  const before = JSON.stringify([...store.entries()]);
  const r = await today();
  assert.equal(JSON.stringify([...store.entries()]), before, 'laporan tidak menulis apa pun');
  const mine = (rows) => rows.filter((x) => x.material_id === String(m.material_id));
  assert.deepEqual(mine(r.purchases.ordered.rows).map((x) => [x.supplier_name, x.qty, x.value]), [['Sup Lap', 10, 15005.5]]);
  assert.deepEqual(mine(r.purchases.cancelled.rows).map((x) => [x.qty, x.value]), [[7, 10503.85]], 'qty_cancelled historis = 10 − 3');
  assert.deepEqual(mine(r.purchases.received.rows).map((x) => [x.qty, x.value]), [[3, 4501.65]], 'penerimaan bersih (4 − 1)');
  assert.deepEqual(mine(r.movements).map((x) => [x.type, x.qty_change, x.count]),
    [['saldo_awal', 10, 1], ['penerimaan', 4, 1], ['koreksi_penerimaan', -1, 1], ['pengeluaran_produksi', -0.1, 1]], 'koreksi = satu mutasi bersih (§4.3)');
  assert.deepEqual(mine(r.usage).map((x) => [x.standard, x.actual, x.variance]), [[0.105, 0.1, -0.005]], 'IT-23: 0,015 × 7 = 0,105; aktual 0,10');
  const woRow = r.production.find((x) => x.wo_id === String(wo.wo_id));
  assert.deepEqual([woRow.net_output, woRow.corrected], [7, true]);
  const plan = r.plan_vs_output.find((x) => x.product_id === String(product.product_id));
  assert.deepEqual([plan.qty_planned, plan.net_output], [13, 7], 'rencana termasuk WO Dibatalkan (9 + 4); hasil hanya dokumen hasil (7)');
  assert.equal(r.production.some((x) => x.wo_id === String(cancelled.wo_id)), false, 'WO Dibatalkan tidak punya hasil');
  const sales = await R.getSalesReport({ period: 'harian' });
  assert.deepEqual(r.revenue, { revenue: sales.kpi.revenue, transactions: sales.kpi.transactions }, 'IT-29 (mock): omzet = AD-08');
});

test('AC-47.4: ekspor = layar — sel rupiah ekspor = nilai respons (tanpa pembulatan); format 2 desimal sama dengan tampilan', async () => {
  const { buildOperationsExportTables } = await import('../../src/utils/operationsExport.js');
  const { formatRupiahExact } = await import('../../src/utils/format.js');
  const report = {
    from: '2026-11-16', to: '2026-11-16',
    purchases: {
      ordered: { rows: [{ supplier_id: '1', supplier_name: 'Sup', material_id: '1', name: 'Tepung', unit: 'kg', qty: 10.33, value: 15005.52 }], total_value: 15005.52 },
      received: { rows: [{ supplier_id: '1', supplier_name: 'Sup', material_id: '1', name: 'Tepung', unit: 'kg', qty: -1, value: -1500.55 }], total_value: -1500.55 },
      cancelled: { rows: [], total_value: 0 },
    },
    movements: [], usage: [], production: [], plan_vs_output: [], revenue: { revenue: 150000.5, transactions: 1 },
  };
  const tables = buildOperationsExportTables(report);
  const ordered = tables.find((t) => t.title === 'Pembelian dipesan');
  assert.deepEqual(ordered.rows, [['Sup', 'Tepung', 'kg', 10.33, { rupiah: 15005.52 }], ['Total', '', '', '', { rupiah: 15005.52 }]]);
  assert.deepEqual(tables.find((t) => t.title === 'Penerimaan').rows.at(-1), ['Total', '', '', '', { rupiah: -1500.55 }]);
  assert.deepEqual(tables[0].rows.map((r) => r[1]), [{ rupiah: 15005.52 }, { rupiah: -1500.55 }, { rupiah: 0 }, { rupiah: 150000.5 }, 1]);
  assert.deepEqual([formatRupiahExact(15005.52), formatRupiahExact(15005.5), formatRupiahExact(-1500.55), formatRupiahExact(0), formatRupiahExact(9999999999999.99)],
    ['Rp 15.005,52', 'Rp 15.005,50', 'Rp -1.500,55', 'Rp 0,00', 'Rp 9.999.999.999.999,99']);
});
