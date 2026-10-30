// Uji mode mock — Step 6.3 · FR-04 · C-12: fungsi keranjang akun di services/cartService.js lewat jalur asli
// apiClient (USE_MOCK = true) → mockHandler. Keranjang akun mock = key localStorage pelanggan (sama dengan useCartStore);
// tamu & staf ditolak seperti requireRole di server. Mode mock diaktifkan tests/unit/mock-env-loader.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async () => { throw new Error('mode mock tidak boleh memanggil fetch'); };

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getSavedCart, saveCart, mergeGuestCartToAccount } = await import('../../src/services/cartService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { userCartKey } = await import('../../src/stores/useCartStore.js');

const item = (overrides) => ({ cart_item_id: 1, product_id: 1, quantity: 1, note: '', ...overrides });
const login = (id, role = 'customer') => useAuthStore.setState({ user: { user_id: id, role }, token: `mock_token_${id}` });
const stored = (id) => JSON.parse(store.get(userCartKey(id)) ?? '[]');

test.beforeEach(() => {
  store.clear();
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
});

test('loader mengaktifkan mode mock', () => {
  assert.equal(USE_MOCK, true);
});

test('tamu dan staf ditolak di ketiga fungsi', async () => {
  for (const user of [null, { user_id: 2, role: 'staf' }]) {
    useAuthStore.setState({ user, token: user ? 'mock' : null });
    await assert.rejects(getSavedCart());
    await assert.rejects(saveCart([item()]));
    await assert.rejects(mergeGuestCartToAccount([item()]));
  }
  assert.deepEqual([...store.keys()].filter((k) => k.startsWith('ovenco_mock_cart_')), []);
});

test('saveCart mengganti keranjang akun; getSavedCart membacanya; akun lain terpisah', async () => {
  login(7);
  await saveCart([item({ product_id: 1, quantity: 3 })]);
  await saveCart([item({ product_id: 2 })]);
  assert.deepEqual((await getSavedCart()).items.map((i) => [i.product_id, i.quantity]), [[2, 1]]);

  login(8);
  assert.deepEqual((await getSavedCart()).items, []);
  assert.equal(stored(7).length, 1);
});

test('mergeGuestCartToAccount menjumlahkan item sama dan menambah item baru (aturan mergeCartItems)', async () => {
  login(7);
  await saveCart([item({ cart_item_id: 1, product_id: 1, quantity: 2 })]);
  const result = await mergeGuestCartToAccount([
    item({ cart_item_id: 1, product_id: 1, quantity: 3 }),
    item({ cart_item_id: 2, product_id: 4 }),
  ]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.items.map((i) => [i.product_id, i.quantity]), [[1, 5], [4, 1]]);
  assert.deepEqual(stored(7).map((i) => i.quantity), [5, 1]);
});
