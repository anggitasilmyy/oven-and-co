// Uji Step 6.6 (CP7 · G11) mode API — respons "tidak ditemukan" yang ditetapkan server (404, atau 400 INVALID_ID)
// menjadi null (sama dengan mock) untuk ulasan produk C-10, Custom Cake Builder C-11, dan form produk AD-06.
// Error jaringan, 500, 401/403, dan 400 lain TIDAK dianggap tidak ditemukan. fetch ditangkap.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
let reply;
const calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  if (reply === 'network') throw new TypeError('Failed to fetch');
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
};

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getProductReviews } = await import('../../src/services/reviewService.js');
const { getCustomCakeBuilder } = await import('../../src/services/customCakeService.js');
const { getAdminProduct } = await import('../../src/services/adminProductService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const NOT_FOUND = { status: 404, body: { status: 'error', message: 'Produk tidak ditemukan.' } };
const INVALID_ID = { status: 400, body: { status: 'error', code: 'INVALID_ID', message: 'ID produk tidak valid.' } };
const SERVER_ERROR = { status: 500, body: { status: 'error', message: 'Terjadi kesalahan pada server.' } };
const VALIDATION = { status: 400, body: { status: 'error', message: 'Data tidak valid.' } };
const FORBIDDEN = { status: 403, body: { status: 'error', message: 'Akses ditolak.' } };
const SERVICES = [
  ['ulasan produk (GET /products/:id/reviews)', () => getProductReviews('abc')],
  ['custom cake (GET /custom-options)', () => getCustomCakeBuilder()],
  ['produk admin (GET /admin/products/:id)', () => getAdminProduct('999999')],
];

test.beforeEach(() => { calls.length = 0; useAuthStore.setState({ user: { userId: '2', role: 'staf' }, token: 'jwt-staf' }); });

test('mode API aktif', () => assert.equal(USE_MOCK, false));

test('404 → null untuk ketiga service', async () => {
  for (const [name, run] of SERVICES) {
    reply = NOT_FOUND;
    assert.equal(await run(), null, name);
  }
});

test('400 INVALID_ID (id tidak valid) → null untuk ulasan & produk admin', async () => {
  reply = INVALID_ID;
  assert.equal(await getProductReviews('abc'), null);
  assert.equal(await getAdminProduct('abc'), null);
});

test('ulasan produk: `data: null` (produk tidak ada/nonaktif) tetap null (N1 tidak berubah)', async () => {
  reply = { status: 200, body: { status: 'success', data: null } };
  assert.equal(await getProductReviews('999999'), null);
});

test('500, jaringan, 403, dan 400 lain TIDAK dianggap tidak ditemukan (tetap dilempar dengan status asli)', async () => {
  for (const [name, run] of SERVICES) {
    for (const [r, status] of [[SERVER_ERROR, 500], ['network', 0], [FORBIDDEN, 403], [VALIDATION, 400]]) {
      reply = r;
      const err = await run().then(() => null, (e) => e);
      assert.ok(err, `${name} ${status} harus dilempar`);
      assert.equal(err.status, status, name);
    }
  }
});

test('data sah tetap dikembalikan apa adanya', async () => {
  reply = { status: 200, body: { status: 'success', data: { product_id: '1', name: 'Croissant' } } };
  assert.deepEqual(await getAdminProduct('1'), { product_id: '1', name: 'Croissant' });
});
