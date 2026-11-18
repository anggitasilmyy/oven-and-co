// Uji CR-04c · AC-NF "mode mock = API" · FR-47 · AC-47.1 – AC-47.4 — skenario CR-04 hari ini dijalankan lewat lapisan
// services/ client di mode mock dan mode API (server + database uji harness), lalu laporan operasional dibandingkan: baris
// milik entitas uji ber-TAG (bahan, supplier, WO, produk uji) dan kontrak error (400/401/403) harus identik. Omzet pembanding
// tidak dibandingkan antar-mode (data penjualan seed berbeda); kesamaannya dengan AD-08 diuji per mode (IT-29).
// Jalankan (dari client/):
//   node --import ./tests/unit/register.mjs tests/step-6.10/parity.diff.mjs mock > /tmp/mock.json
//   node --import ./tests/unit/register.mjs tests/step-6.10/parity.diff.mjs api > /tmp/api.json   (http://localhost:4000/api)
//   node tests/step-6.10/parity.diff.mjs compare /tmp/mock.json /tmp/api.json   → exit 0 bila semua langkah identik
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const MODE = process.argv[2];
if (MODE === 'compare') {
  const [a, b] = [process.argv[3], process.argv[4]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  let diffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const [x, y] = [JSON.stringify(a[i]), JSON.stringify(b[i])];
    if (x !== y) { diffs += 1; console.log(`✗ ${a[i]?.step ?? b[i]?.step}\n  mock: ${x}\n  api : ${y}`); }
  }
  console.log(`\n${a.length - diffs}/${a.length} langkah identik (mock ${a.length}, api ${b.length})`);
  process.exit(diffs || a.length !== b.length ? 1 : 0);
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (MODE === 'mock') register('../unit/mock-env-loader.mjs', import.meta.url);
if (MODE === 'mock') globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const W = await import('../../src/services/workOrderService.js');
const S = await import('../../src/services/stockService.js');
const P = await import('../../src/services/purchasingService.js');
const R = await import('../../src/services/recipeService.js');
const REP = await import('../../src/services/reportService.js');
const { getAdminProducts } = await import('../../src/services/adminProductService.js');
const { login } = await import('../../src/services/authService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const TAG = `R${Date.now().toString(36)}`;
const uuid = () => globalThis.crypto.randomUUID();
const as = async (email) => {
  useAuthStore.setState({ user: null, token: null });
  const r = await login(email, 'demo1234');
  useAuthStore.setState({ user: r.user, token: r.token });
};

const idSpaces = new Map();
const idOf = (space, v) => {
  if (!idSpaces.has(space)) idSpaces.set(space, new Map());
  const m = idSpaces.get(space);
  if (!m.has(String(v))) m.set(String(v), `${space}#${m.size + 1}`);
  return m.get(String(v));
};
const SPACE = { material_id: 'M', product_id: 'P', wo_id: 'WO', issue_id: 'I', output_id: 'O', movement_id: 'V', supplier_id: 'S', po_id: 'PO', po_item_id: 'POI', receipt_id: 'R' };
function norm(v, key = '') {
  if (Array.isArray(v)) return v.map((x) => norm(x, key));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (/_at$/.test(k)) out[k] = v[k] == null ? null : 'T';
      else if (k === 'id' && v.source) out[k] = idOf(v.source === 'material_issue' ? 'I' : 'D', v[k]);
      else if ((k === 'reverses_id' || k === 'replaces_id') && v[k] != null) out[k] = idOf('issue_id' in v ? 'I' : 'receipt_id' in v ? 'R' : 'O', v[k]);
      // reversal_id/replacement_id: respons pengeluaran membawa `movements`, respons hasil tidak — ruang ID beda
      else if ((k === 'reversal_id' || k === 'replacement_id') && v[k] != null) out[k] = idOf('movements' in v ? 'I' : 'O', v[k]);
      else if (k === 'materials' && typeof v[k] === 'string') out[k] = v[k].split(', ').map((x) => idOf('M', x)).join(', '); // STOCK_OUT_OF_RANGE
      else if (k === 'production_date') out[k] = 'DATE';
      else out[k] = norm(v[k], k);
    }
    return out;
  }
  if (v != null && SPACE[key]) return idOf(SPACE[key], v);
  if (typeof v === 'string') return v.replaceAll(TAG, 'TAG').replace(/WO-\d{6}-\d{3}/g, (n) => idOf('NO', n)).replace(/PO-\d{6}-\d{3}/g, (n) => idOf('PONO', n));
  return v;
}
const out = [];
process.on('exit', (code) => { if (code) console.log(JSON.stringify(out, null, 1)); });
const tracked = { materials: [], orders: [] };
async function snapshot() {
  const user = useAuthStore.getState();
  if (user.user?.role !== 'staf') await as('staf@demo.com');
  const rows = (await S.getRawMaterials()).rows;
  const state = {
    materials: await Promise.all(tracked.materials.map(async (id) => ({ stock: rows.find((m) => String(m.material_id) === String(id))?.stock, movements: (await S.getMaterialMovements(id)).movements.length }))),
    orders: await Promise.all(tracked.orders.map(async (id) => { const w = await W.getWorkOrder(id); return { status: w.status, qty: w.qty_planned, issues: w.issues.length, outputs: w.outputs.length, net: w.net_output }; })),
  };
  if (user.user?.role !== 'staf') useAuthStore.setState(user);
  return JSON.stringify(state);
}
async function step(name, fn) {
  const before = await snapshot();
  try {
    const data = await fn();
    out.push({ step: name, ok: true, data: norm(data) });
    return data;
  } catch (e) {
    const unchanged = before === await snapshot();
    // fieldErrors: kunci adalah nama field (nilai = pesan), bukan ID — hanya `materials` (daftar ID) yang dinormalisasi
    const fieldErrors = e.fieldErrors ? Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k, k === 'materials' ? norm({ materials: m }).materials : norm(m)])) : null;
    out.push({ step: name, ok: false, status: e.status ?? null, code: e.code ?? null, message: norm(e.message), fieldErrors, unchanged });
    return null;
  }
}

await as('staf@demo.com');
const m1 = await step('bahan M1 stok 10', () => S.saveMaterial(null, { name: `Tepung ${TAG}`, unit: 'kg', stock: '10', min_stock: '1' }, uuid()));
const m2 = await step('bahan M2 stok 3', () => S.saveMaterial(null, { name: `Gula ${TAG}`, unit: 'kg', stock: '3', min_stock: '1' }, uuid()));
tracked.materials.push(m1.material_id, m2.material_id);
const sup = await step('supplier', () => P.saveSupplier(null, { name: `Sup ${TAG}`, phone: '+6281234567890', address: 'Jl. 1', email: 'a@b.id', contact_person: 'S', material_ids: [m1.material_id, m2.material_id] }, uuid()));
const po = await step('PO 2 item', () => P.savePurchaseOrder(null, { supplier_id: sup.supplier_id, items: [{ material_id: m1.material_id, qty_ordered: '10', unit_price: '1500.55' }, { material_id: m2.material_id, qty_ordered: '2.5', unit_price: '1000.01' }] }, uuid()));
await step('PO pesan', () => P.changePurchaseOrderStatus(po.po_id, { from: 'draft', to: 'dipesan' }, uuid()));
const [i1, i2] = (await P.getPurchaseOrder(po.po_id)).items.map((i) => i.po_item_id);
await step('terima M1 4 + M2 1', () => P.receivePurchaseOrder(po.po_id, { lines: [{ po_item_id: i1, qty: '4' }, { po_item_id: i2, qty: '1' }] }, uuid()));
const rec = (await P.getPurchaseOrder(po.po_id)).receipts[0].receipt_id;
await step('koreksi penerimaan (M1 4 → 3)', () => P.reverseOrCorrectReceipt(rec, { lines: [{ po_item_id: i1, qty: '3' }, { po_item_id: i2, qty: '1' }], reason: 'salah' }, uuid(), { correct: true }));
await step('PO batal (sisa historis)', () => P.changePurchaseOrderStatus(po.po_id, { from: 'diterima_sebagian', to: 'dibatalkan' }, uuid()));
await step('stok masuk M2 2', () => S.recordStockIn(m2.material_id, '2', uuid()));
const product = (await getAdminProducts()).rows.find((p) => p.name === 'Classic Butter Croissant');
await step('komposisi produk uji', () => R.saveProductRecipe(product.product_id, [{ material_id: String(m1.material_id), qty_per_unit: '0.015' }, { material_id: String(m2.material_id), qty_per_unit: '0.250' }]));
const today = (await W.getPlanSource()).today_key;
const wo = await step('WO dibuat', () => W.saveWorkOrder(null, { product_id: String(product.product_id), production_date: today, qty_planned: 9 }, uuid()));
await step('WO mulai', () => W.changeWorkOrderStatus(wo.wo_id, { from: 'draft', to: 'diproses' }, uuid()));
const iss = await step('pengeluaran M1 0,1 + M2 2', () => W.issueMaterials(wo.wo_id, { lines: [{ material_id: String(m1.material_id), qty: '0.1' }, { material_id: String(m2.material_id), qty: '2' }] }, uuid()));
await step('koreksi pengeluaran (M2 2 → 1,5)', () => W.reverseOrCorrectIssue(iss.issue_id, { lines: [{ material_id: String(m1.material_id), qty: '0.1' }, { material_id: String(m2.material_id), qty: '1.5' }], reason: 'sisa' }, uuid(), { correct: true }));
const done = await step('selesai hasil 5', () => W.completeWorkOrder(wo.wo_id, { qty_output: 5 }, uuid()));
await step('koreksi hasil 5 → 7', () => W.reverseOrCorrectOutput(done.output_id, { qty_output: 7, reason: 'hitung ulang' }, uuid(), { correct: true }));
const wo2 = await step('WO-2 dibuat lalu batal (tetap rencana, tanpa hasil)', () => W.saveWorkOrder(null, { product_id: String(product.product_id), production_date: today, qty_planned: 4 }, uuid()));
await step('WO-2 batal', () => W.changeWorkOrderStatus(wo2.wo_id, { from: 'draft', to: 'dibatalkan' }, uuid()));
await step('Staf: laporan operasional ditolak', () => REP.getOperationsReport({ period: 'harian' }));

// ── Laporan (Owner): baris milik entitas uji saja (rencana: hanya WO uji — WO lain di database uji tidak setara antar-mode)
await as('owner@demo.com');
const mine = (rows) => rows.filter((r) => [m1.material_id, m2.material_id].map(String).includes(String(r.material_id)));
const pickReport = (r) => ({
  period: r.period, from: r.from === today, to: r.to === today,
  ordered: mine(r.purchases.ordered.rows), received: mine(r.purchases.received.rows), cancelled: mine(r.purchases.cancelled.rows),
  movements: mine(r.movements), usage: mine(r.usage), production: r.production.filter((x) => String(x.wo_id) === String(wo.wo_id)),
  keys: Object.keys(r).sort(), analysis_keys: Object.keys(r.analysis.requirements).sort(),
});
await step('laporan harian (entitas uji)', async () => pickReport(await REP.getOperationsReport({ period: 'harian' })));
await step('laporan mingguan (entitas uji)', async () => pickReport(await REP.getOperationsReport({ period: 'mingguan' })));
await step('laporan rentang lampau (entitas uji kosong)', async () => pickReport(await REP.getOperationsReport({ period: 'rentang', from: '2026-01-01', to: '2026-01-07' })));
await step('periode tidak dikenal → 400', () => REP.getOperationsReport({ period: 'tahunan' }));
await step('rentang tanpa tanggal → 400', () => REP.getOperationsReport({ period: 'rentang' }));
await step('rentang terbalik → 400', () => REP.getOperationsReport({ period: 'rentang', from: '2026-11-10', to: '2026-11-01' }));
await step('rentang > 92 hari → 400', () => REP.getOperationsReport({ period: 'rentang', from: '2026-01-01', to: today }));
await step('rentang melewati hari ini → 400', () => REP.getOperationsReport({ period: 'rentang', from: today, to: '2099-01-01' }));
await as('pelanggan@demo.com');
await step('pelanggan: laporan operasional ditolak', () => REP.getOperationsReport({ period: 'harian' }));
useAuthStore.setState({ user: null, token: null });
await step('tanpa sesi: laporan operasional ditolak', () => REP.getOperationsReport({ period: 'harian' }));

console.log(JSON.stringify(out, null, 1));
