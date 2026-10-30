// Uji regresi review dc054bd — kelemahan uji adapter mock (review sebelumnya): jalur mode mock diuji LENGKAP lewat
// apiClient (USE_MOCK = true) → runMockRequest → mockHandler customCakeService → createMockCustomCakeDesign, bukan
// dengan memanggil handler langsung. Mode mock diaktifkan oleh tests/unit/mock-env-loader.mjs (file uji terpisah,
// proses Node sendiri). SIMULASI Node: "tab lain" = menulis sesi kanonis "ovenco_auth". Bukan bukti browser nyata.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const store = globalThis.localStorage.map;
globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const { apiClient, USE_MOCK } = await import('../../src/services/apiClient.js');
const { saveCustomCakeToCart, DESIGN_CART_TARGET } = await import('../../src/services/customCakeCartService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { getTables } = await import('../../src/services/mock/db.js');
const { getMockCurrentTime } = await import('../../src/services/mock/mockClock.js');
const { groupCustomOptions, getEarliestReadyDate } = await import('../../src/utils/businessRules.js');
const { CLIENT_ERROR_CODE } = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const mockCustomer = (id) => ({ user_id: id, name: `Pelanggan ${id}`, role: 'customer' });
const otherTabWrites = (user, token) => store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
const designRow = (id) => getTables('custom_cake_designs').custom_cake_designs.find((d) => d.design_id === id);
const designsIn = (key) => JSON.parse(store.get(key) ?? '[]').map((i) => i.design_id);
const PRODUCT = { product_id: 6, name: 'Custom Celebration Cake', image_url: '/images/products/custom-cake-1.webp' };

/** Desain sah dari data mock nyata (opsi aktif pertama per kelompok, tanggal tercepat) */
function validMockDesign() {
  const t = getTables('products', 'custom_options', 'store_settings');
  const product = t.products.find((p) => p.is_active && p.availability_type === 'custom');
  const grouped = groupCustomOptions(t.custom_options);
  const selections = Object.fromEntries(Object.entries(grouped).map(([group, list]) => [group, list[0].option_id]));
  return {
    selections, writingText: '', writingColor: 'Cokelat', referencePhoto: null,
    readyDate: getEarliestReadyDate(product, getMockCurrentTime(), t.store_settings),
  };
}

test.beforeEach(() => {
  store.clear();
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
});

test('mock adapter: loader benar-benar mengaktifkan mode mock (apiClient tanpa fetch)', () => {
  assert.equal(USE_MOCK, true);
});

test('mock adapter + M-A: tamu menyimpan desain, pelanggan 7 masuk di tab lain selama jeda → desain milik TAMU, masuk keranjang 7', async () => {
  const pending = saveCustomCakeToCart(validMockDesign(), PRODUCT);
  otherTabWrites(mockCustomer(7), 'mock_token_7_x');

  const result = await pending;

  assert.equal(designRow(result.saved.design_id).user_id, null); // adapter meneruskan sessionUser awal (tamu)
  assert.equal(result.target, DESIGN_CART_TARGET.ACCOUNT_MERGED);
  assert.deepEqual(designsIn('ovenco_mock_cart_7'), [result.saved.design_id]);
  assert.equal(store.has('ovenco_mock_cart_guest'), false);
});

test('mock adapter: pelanggan yang identitasnya tidak berubah → desain milik pelanggan itu, keranjang aktif', async () => {
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1_x');
  useCartStore.getState().loadCartForUser(mockCustomer(1));

  const result = await saveCustomCakeToCart(validMockDesign(), PRODUCT);

  assert.equal(designRow(result.saved.design_id).user_id, 1);
  assert.equal(result.target, DESIGN_CART_TARGET.ACTIVE);
  assert.deepEqual(designsIn('ovenco_mock_cart_1'), [result.saved.design_id]);
});

test('mock adapter: pelanggan 1 menyimpan desain, tab lain beralih ke pelanggan 2 → ditolak, desain tidak dibuat, keranjang utuh', async () => {
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1_x');
  useCartStore.getState().loadCartForUser(mockCustomer(1));
  const before = getTables('custom_cake_designs').custom_cake_designs.length;

  const pending = saveCustomCakeToCart(validMockDesign(), PRODUCT);
  otherTabWrites(mockCustomer(2), 'mock_token_2_x');

  await assert.rejects(pending, { code: CLIENT_ERROR_CODE.SESSION_CHANGED });
  assert.equal(getTables('custom_cake_designs').custom_cake_designs.length, before);
  assert.equal(store.has('ovenco_mock_cart_1'), false);
  assert.equal(store.has('ovenco_mock_cart_2'), false);
});

test('mock adapter + L6: apiClient meneruskan metode → mutasi ditolak bila token pengguna sama berganti selama jeda', async () => {
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1_x');
  let ran = false;
  const pending = apiClient('/me/addresses', { method: 'POST', body: {}, mockHandler: () => { ran = true; } });
  otherTabWrites(mockCustomer(1), 'mock_token_1_y');

  await assert.rejects(pending, { code: CLIENT_ERROR_CODE.SESSION_CHANGED });
  assert.equal(ran, false);
});
