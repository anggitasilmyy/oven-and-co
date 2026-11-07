// Uji Step 6.6 (CP7) mode mock — G11: kondisi "tidak ditemukan" mock tetap null (kontrak sama dengan API);
// G14: Best Sellers mock = kontrak server GET /api/products/best-sellers (produk nonaktif disaring SEBELUM dipotong
// ke limit; urut jumlah terjual turun lalu id naik; Dashboard memakai daftar yang sama). Tanpa fetch.

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
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getBestSellers } = await import('../../src/services/productService.js');
const { getOwnerDashboard } = await import('../../src/services/dashboardService.js');
const { getProductReviews } = await import('../../src/services/reviewService.js');
const { getCustomCakeBuilder } = await import('../../src/services/customCakeService.js');
const { getAdminProduct } = await import('../../src/services/adminProductService.js');
const { getTables, updateTable } = await import('../../src/services/mock/db.js');
const { getMockTodayKey } = await import('../../src/services/mock/mockClock.js');
const { getBestSellerTotals } = await import('../../src/utils/businessRules.js');
const { lastNDateKeys } = await import('../../src/utils/date.js');
const { BEST_SELLER_LIMIT, SALES_WINDOW_DAYS } = await import('../../src/constants/dashboard.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const setActive = (ids, isActive) => updateTable('products', (rows) => rows.map((p) => (ids.includes(p.product_id) ? { ...p, is_active: isActive } : p)));
/** Peringkat penuh (tanpa batas) = urutan server sebelum penyaringan produk nonaktif */
const fullRanking = () => {
  const t = getTables('orders', 'order_items');
  return getBestSellerTotals(t.orders, t.order_items, lastNDateKeys(getMockTodayKey(), SALES_WINDOW_DAYS), Infinity);
};

test.beforeEach(() => { store.clear(); fetchCalls = 0; useAuthStore.setState({ user: null, token: null }); });
test.after(() => assert.equal(fetchCalls, 0));

test('mode mock aktif', () => assert.equal(USE_MOCK, true));

test('prasyarat data: lebih dari BEST_SELLER_LIMIT produk terjual dalam 7 hari', () => {
  assert.ok(fullRanking().length > BEST_SELLER_LIMIT, `terjual: ${fullRanking().length}`);
});

test('G14: produk terlaris #1 nonaktif → disaring SEBELUM dipotong; daftar tetap penuh, diisi produk berikutnya', async () => {
  const ranking = fullRanking();
  setActive([ranking[0].product_id], false);
  const expected = ranking.slice(1, BEST_SELLER_LIMIT + 1);
  const result = await getBestSellers({ limit: BEST_SELLER_LIMIT });
  assert.equal(result.length, BEST_SELLER_LIMIT, 'dulu: 4 dari 5 (dipotong dulu, baru disaring)');
  assert.deepEqual(result.map((p) => [p.product_id, p.quantity_sold]), expected.map((r) => [r.product_id, r.quantity]));
  assert.ok(result.every((p) => p.is_active));
});

test('G14: urutan = jumlah terjual turun lalu id naik (kontrak server)', async () => {
  const result = await getBestSellers({ limit: BEST_SELLER_LIMIT });
  for (let i = 1; i < result.length; i += 1) {
    const [a, b] = [result[i - 1], result[i]];
    assert.ok(a.quantity_sold > b.quantity_sold || (a.quantity_sold === b.quantity_sold && a.product_id < b.product_id), JSON.stringify([a.product_id, b.product_id]));
  }
});

test('G14: Dashboard AD-02 memakai daftar yang sama dengan C-05 (produk nonaktif tidak tampil)', async () => {
  const ranking = fullRanking();
  setActive([ranking[1].product_id], false);
  useAuthStore.setState({ user: { user_id: 3, role: 'owner' }, token: 'mock_token_3' });
  const dashboard = await getOwnerDashboard();
  const home = await getBestSellers({ limit: BEST_SELLER_LIMIT });
  assert.deepEqual(dashboard.bestSellers.map((p) => p.product_id), home.map((p) => p.product_id));
  assert.ok(!dashboard.bestSellers.some((p) => p.product_id === ranking[1].product_id));
});

test('G14: semua produk terjual nonaktif → daftar kosong', async () => {
  setActive(fullRanking().map((r) => r.product_id), false);
  assert.deepEqual(await getBestSellers({ limit: BEST_SELLER_LIMIT }), []);
});

test('G11 mock: ulasan id tidak valid / tidak ada → null; produk admin tidak ada → null', async () => {
  assert.equal(await getProductReviews('abc'), null);
  assert.equal(await getProductReviews('999999'), null);
  useAuthStore.setState({ user: { user_id: 2, role: 'staf' }, token: 'mock_token_2' });
  assert.equal(await getAdminProduct('999999'), null);
});

test('G11 mock: produk custom cake nonaktif → null (C-11 menampilkan "Custom cake belum tersedia")', async () => {
  const custom = getTables('products').products.filter((p) => p.availability_type === 'custom').map((p) => p.product_id);
  assert.ok(custom.length > 0);
  setActive(custom, false);
  assert.equal(await getCustomCakeBuilder(), null);
});
