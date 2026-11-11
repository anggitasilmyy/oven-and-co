// Uji CR-03 CP7 mode mock · FR-40 · UC-32 · BR-14 – BR-16 · AD-07 tab Kebutuhan Bahan — getMaterialRequirements (mock)
// = kontrak §B7.3: hasilnya identik dengan aturan murni SERVER untuk data mock yang sama (AC-40.14, tanpa perhitungan
// kedua), jendela tanggal T … T+29 (AC-40.11), status Kurang/Menipis/Cukup, produk tanpa komposisi (AC-40.10, E-7),
// tidak menulis data (AC-40.8), MILLI_PRECISION_LOST → 500, peran. Teks keterangan K-14 = SPEC §5. Tanpa fetch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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
const serverRules = require('../../../server/src/services/materialRequirementRules.service.js');
const { getMaterialRequirements } = await import('../../src/services/stockService.js');
const { getTables, updateTable } = await import('../../src/services/mock/db.js');
const { getMockTodayKey } = await import('../../src/services/mock/mockClock.js');
const { addDaysToKey } = await import('../../src/utils/date.js');
const { MATERIAL_REQUIREMENT_NOTE, MATERIAL_DEMAND_STATUS_META } = await import('../../src/constants/recipe.js');
const { STOCK_TABS } = await import('../../src/constants/adminCatalog.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const as = (role) => useAuthStore.setState({ user: { user_id: role === 'customer' ? 7 : 3, role }, token: `mock_token_${role}` });
const failOf = async (promise) => promise.then(() => assert.fail('harus gagal'), (err) => err);
const T = () => getMockTodayKey();

/** Input aturan murni server dari tabel mock (pembanding independen: perhitungan server, bukan port client) */
function serverExpected(date) {
  const t = getTables('orders', 'order_items', 'products', 'daily_stocks', 'product_materials', 'raw_materials');
  const type = new Map(t.products.map((p) => [String(p.product_id), p.availability_type]));
  const orders = new Map(t.orders.map((o) => [o.order_id, o]));
  return JSON.parse(JSON.stringify(serverRules.computeMaterialRequirements({
    todayKey: T(), date,
    orderItems: t.order_items.map((i) => ({ product_id: String(i.product_id), availability_type: type.get(String(i.product_id)), order_status: orders.get(i.order_id).order_status, ready_date: orders.get(i.order_id).ready_date, quantity: i.quantity })),
    readyPlans: t.daily_stocks.map((s) => ({ product_id: String(s.product_id), availability_type: type.get(String(s.product_id)), stock_date: s.stock_date, qty_planned: s.qty_planned })),
    recipes: t.product_materials.map((r) => ({ product_id: String(r.product_id), material_id: String(r.material_id), qty_per_unit: r.qty_per_unit })),
    materials: t.raw_materials.map((m) => ({ material_id: String(m.material_id), name: m.name, unit: m.unit, stock: String(m.stock), min_stock: String(m.min_stock) })),
    productNames: Object.fromEntries(t.products.map((p) => [String(p.product_id), p.name])),
  })));
}

test.beforeEach(() => { store.clear(); fetchCalls = 0; as('staf'); });
test.after(() => assert.equal(fetchCalls, 0));

test('tab ketiga "Kebutuhan Bahan" (?tab=kebutuhan); label status §B3.8', () => {
  assert.deepEqual(STOCK_TABS.map((t) => [t.key, t.label]).at(-1), ['kebutuhan', 'Kebutuhan Bahan']);
  assert.deepEqual(Object.entries(MATERIAL_DEMAND_STATUS_META).map(([k, m]) => [k, m.label, m.variant]),
    [['kurang', 'Kurang', 'error'], ['menipis', 'Menipis', 'preorder'], ['cukup', 'Cukup', 'ready']]);
});

test('K-14: teks keterangan wajib = SPEC §5 (CR-03 §B3.7) kata per kata', () => {
  const spec = readFileSync(new URL('../../../docs/SPEC.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const quoted = spec.match(/Teks keterangan wajib di tab Kebutuhan Bahan \([^)]*\): \*"([^"]+)"\*/)[1];
  assert.equal(MATERIAL_REQUIREMENT_NOTE, quoted);
});

test('AC-40.14: hasil mock identik dengan aturan murni server untuk data yang sama (beberapa tanggal)', async () => {
  for (const offset of [0, 1, 3, 10, 29]) {
    const date = addDaysToKey(T(), offset);
    const res = await getMaterialRequirements(offset === 0 ? '' : date);
    assert.deepEqual(res, serverExpected(date), date);
    assert.deepEqual(res.cumulative_range, { from: T(), to: date });
  }
});

test('AC-40.11: kosong = hari ini; batas T & T+29 diterima; di luar / tidak valid → 400 pesan kontrak', async () => {
  const today = await getMaterialRequirements();
  assert.deepEqual([today.date, today.window], [T(), { from: T(), to: addDaysToKey(T(), 29) }]);
  assert.equal((await getMaterialRequirements(addDaysToKey(T(), 29))).date, addDaysToKey(T(), 29));
  for (const [d, msg] of [[addDaysToKey(T(), -1), 'Tanggal di luar rentang.'], [addDaysToKey(T(), 30), 'Tanggal di luar rentang.'], ['2026-02-30', 'Tanggal tidak valid.'], ['abc', 'Tanggal tidak valid.']]) {
    const err = await failOf(getMaterialRequirements(d));
    assert.deepEqual([err.status, err.message], [400, msg], d);
  }
});

test('status Kurang/Menipis/Cukup & kekurangan dari API; produk tanpa komposisi tampil (E-7); tanpa tulis', async () => {
  updateTable('raw_materials', (rows) => rows.map((m) => (m.material_id === 2 ? { ...m, stock: 0 } : m.material_id === 3 ? { ...m, stock: 9999, min_stock: 0 } : m)));
  updateTable('product_materials', (rows) => rows.filter((r) => r.product_id !== 1)); // croissant tanpa komposisi
  const before = JSON.stringify([...store.entries()]);
  const res = await getMaterialRequirements();
  assert.equal(JSON.stringify([...store.entries()]), before, 'AC-40.8: tidak ada data yang ditulis');
  const butter = res.rows.find((r) => r.material_id === '2');
  assert.ok(butter.cumulative_need > 0 && butter.status === 'kurang' && butter.shortage === -butter.remaining && butter.shortage > 0, JSON.stringify(butter));
  assert.equal(res.rows.find((r) => r.material_id === '3').status, 'cukup');
  assert.deepEqual([res.rows[0].material_id, res.summary.kurang], ['2', 1], 'urutan Kurang dahulu');
  const croissant = res.products_without_recipe.find((p) => p.product_id === '1');
  assert.ok(croissant && croissant.name === 'Classic Butter Croissant' && croissant.cumulative_quantity > 0, JSON.stringify(res.products_without_recipe));
  assert.equal(Object.values(res.summary).reduce((a, b) => a + b, 0), res.rows.length);
});

test('MILLI_PRECISION_LOST → 500 + kode + pesan aman (sama server); pelanggan ditolak', async () => {
  updateTable('product_materials', (rows) => [...rows.filter((r) => r.product_id !== 1), { product_id: 1, material_id: 1, qty_per_unit: '9999999.999' }]);
  updateTable('daily_stocks', (rows) => rows.map((s) => (s.product_id === 1 && s.stock_date === T() ? { ...s, qty_planned: 2147483647 } : s)));
  const err = await failOf(getMaterialRequirements());
  assert.deepEqual([err.status, err.code, err.message], [500, 'MILLI_PRECISION_LOST', 'Hasil perhitungan tidak dapat direpresentasikan secara aman.']);
  as('customer');
  assert.match((await failOf(getMaterialRequirements())).message, /Akses ditolak/);
});
