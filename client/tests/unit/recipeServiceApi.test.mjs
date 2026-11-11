// Uji CR-03 CP6 mode API · FR-39 · AD-06 — recipeService memanggil kontrak CR-03 §B7.1 – §B7.2: GET/PUT
// /api/admin/products/:id/materials, takaran dikirim sebagai STRING desimal, error 400 + fieldErrors diteruskan ke form.
// fetch ditangkap; tanpa server sungguhan.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const calls = [];
let reply;
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
};

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getProductRecipe, saveProductRecipe } = await import('../../src/services/recipeService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const RECIPE = { product_id: '1', product_name: 'Classic Butter Croissant', availability_type: 'ready', items: [{ material_id: '2', name: 'Butter', unit: 'kg', qty_per_unit: 0.015 }] };

test.beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, body: { status: 'success', data: RECIPE } };
  useAuthStore.setState({ user: { userId: '3', role: 'staf' }, token: 'jwt-staf' });
});

test('mode API aktif', () => assert.equal(USE_MOCK, false));

test('GET komposisi → /api/admin/products/:id/materials, data apa adanya', async () => {
  assert.deepEqual(await getProductRecipe('1'), RECIPE);
  assert.match(calls[0].url, /\/admin\/products\/1\/materials$/);
  assert.equal(calls[0].init.method ?? 'GET', 'GET');
  assert.match(calls[0].init.headers.Authorization, /^Bearer jwt-staf$/);
});

test('PUT: seluruh komposisi, material_id & qty_per_unit dikirim sebagai string', async () => {
  await saveProductRecipe('1', [{ material_id: '2', qty_per_unit: '0.015' }, { material_id: '3', qty_per_unit: '9999999.999' }]);
  assert.equal(calls[0].init.method, 'PUT');
  assert.match(calls[0].url, /\/admin\/products\/1\/materials$/);
  assert.equal(calls[0].init.body, '{"items":[{"material_id":"2","qty_per_unit":"0.015"},{"material_id":"3","qty_per_unit":"9999999.999"}]}');
  await saveProductRecipe('4', []);
  assert.equal(calls[1].init.body, '{"items":[]}');
});

test('400 fieldErrors & 404 server diteruskan ke form', async () => {
  reply = { status: 400, body: { status: 'error', message: 'Maksimal 3 angka desimal', fieldErrors: { 'items.0.qty_per_unit': 'Maksimal 3 angka desimal' } } };
  const err = await saveProductRecipe('1', [{ material_id: '2', qty_per_unit: '0.0015' }]).catch((e) => e);
  assert.deepEqual([err.status, err.message, err.fieldErrors], [400, 'Maksimal 3 angka desimal', { 'items.0.qty_per_unit': 'Maksimal 3 angka desimal' }]);
  reply = { status: 404, body: { status: 'error', message: 'Produk tidak ditemukan.' } };
  const missing = await getProductRecipe('99').catch((e) => e);
  assert.deepEqual([missing.status, missing.message], [404, 'Produk tidak ditemukan.']);
});
