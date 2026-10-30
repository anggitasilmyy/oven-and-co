// Uji kontrak mode API — Step 6.3 · FR-04 · C-12: fungsi keranjang akun di services/cartService.js memanggil
// endpoint server yang benar (GET/PUT /api/cart/items, POST /api/cart/merge) dengan token sesi & body { items }.
// fetch & localStorage dipalsukan; tidak ada request jaringan nyata. useCartStore tidak disambungkan (Step 6.6).

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};

const calls = [];
let nextBody = null;
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, json: async () => ({ status: 'success', data: nextBody }) };
};

const { getSavedCart, saveCart, mergeGuestCartToAccount } = await import('../../src/services/cartService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const ITEM = { cart_item_id: 5, product_id: '6', design_id: '91', design_token: 'tok', quantity: 1, note: '' };

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-pelanggan');
});

const last = () => calls.at(-1);
const headerOf = (call, name) => new Headers(call.init.headers).get(name);

test('getSavedCart → GET /cart/items dengan token, data diteruskan apa adanya', async () => {
  nextBody = { items: [ITEM] };
  assert.deepEqual(await getSavedCart(), { items: [ITEM] });
  assert.match(last().url, /\/cart\/items$/);
  assert.equal(last().init.method ?? 'GET', 'GET');
  assert.equal(headerOf(last(), 'Authorization'), 'Bearer jwt-pelanggan');
});

test('saveCart → PUT /cart/items dengan body { items }', async () => {
  nextBody = { items: [], skipped: [] };
  await saveCart([ITEM]);
  assert.match(last().url, /\/cart\/items$/);
  assert.equal(last().init.method, 'PUT');
  assert.deepEqual(JSON.parse(last().init.body), { items: [ITEM] });
});

test('mergeGuestCartToAccount → POST /cart/merge; design_token item tamu ikut terkirim', async () => {
  nextBody = { items: [], skipped: [] };
  await mergeGuestCartToAccount([ITEM]);
  assert.match(last().url, /\/cart\/merge$/);
  assert.equal(last().init.method, 'POST');
  assert.equal(JSON.parse(last().init.body).items[0].design_token, 'tok');
  assert.equal(headerOf(last(), 'Authorization'), 'Bearer jwt-pelanggan');
});
