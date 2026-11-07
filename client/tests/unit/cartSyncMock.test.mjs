// Uji mode mock — Step 6.6 (CP3): sinkronisasi keranjang akun TIDAK aktif; kunci lama `ovenco_mock_cart_*`, tanpa journal,
// tanpa fetch; login tetap memakai mergeGuestCart lama. Mode mock diaktifkan tests/unit/mock-env-loader.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };

const { IS_MOCK_MODE } = await import('../../src/constants/dataMode.js');
const sync = await import('../../src/services/cartSync.js');
const { GUEST_CART_KEY, userCartKey } = await import('../../src/services/cartStorage.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { CART_SYNC_STATUS } = await import('../../src/constants/cart.js');

test.beforeEach(() => {
  store.clear();
  fetchCalls = 0;
  useAuthStore.setState({ user: null, token: null });
  useCartStore.getState().resetToGuest();
});

test('mode mock memakai kunci lama ovenco_mock_cart_* (data mock tidak berpindah)', () => {
  assert.equal(IS_MOCK_MODE, true);
  assert.equal(GUEST_CART_KEY, 'ovenco_mock_cart_guest');
  assert.equal(userCartKey(1), 'ovenco_mock_cart_1');
});

test('login mock: keranjang tamu digabung lokal seperti sebelumnya; tanpa fetch, tanpa journal/catatan sinkronisasi', async () => {
  store.set('ovenco_mock_cart_1', JSON.stringify([{ cart_item_id: 1, product_id: 1, quantity: 1, variant_id: null, design_id: null, preferred_date: null, note: '' }]));
  useCartStore.getState().addItem({ product_id: 1, quantity: 2, name: 'Croissant', price: 28000 });
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'mock_token_1');
  assert.equal((await sync.syncCartAfterLogin({ user_id: 1, role: 'customer' })).status, CART_SYNC_STATUS.IDLE);
  assert.deepEqual(useCartStore.getState().items.map((i) => i.quantity), [3]);
  assert.equal(store.get('ovenco_mock_cart_guest'), undefined);
  useCartStore.getState().updateQuantity(useCartStore.getState().items[0].cart_item_id, 4);
  assert.equal([...store.keys()].filter((k) => k.startsWith('ovenco_api_')).length, 0);
  assert.equal(fetchCalls, 0);
});

test('flushCartSync & startCartSync di mode mock: tidak melakukan apa pun', async () => {
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'mock_token_1');
  assert.equal((await sync.flushCartSync()).status, CART_SYNC_STATUS.IDLE);
  const stop = sync.startCartSync();
  stop();
  assert.equal(sync.isCartSyncRunningForTests(), 0);
  assert.equal(fetchCalls, 0);
});
