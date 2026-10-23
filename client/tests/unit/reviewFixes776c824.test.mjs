// Uji regresi review commit 776c824 — M-1 (id keranjang lama tidak stabil) dan M-2 (pesanan berhasil mengurangi JUMLAH
// yang dipesan, bukan seluruh baris). Menguji jalur aslinya: useCartStore → localStorage, createOrder → apiClient →
// sessionRecovery → reconcileOwner. SIMULASI Node: "tab lain" = instance KEDUA useCartStore (modul yang sama diimpor
// ulang dengan query) yang berbagi localStorage. Bukan bukti browser nyata.

import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const map = new Map();
  let writes = 0;
  return {
    map,
    writes: () => writes,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes += 1; map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const store = globalThis.localStorage.map;

const calls = [];
function scriptFetch(steps) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`fetch tak terduga ke ${url}`);
    step.before?.();
    if (step.networkError) throw new TypeError('Failed to fetch');
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body };
  };
}

const { createOrder } = await import('../../src/services/orderService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
// Tab kedua: instance store terpisah (state memori sendiri), localStorage bersama
const { default: otherTabCart } = await import('../../src/stores/useCartStore.js?tab=kedua');
const { toOrderedLines, subtractOrderedItems } = await import('../../src/utils/rules/cart.js');
const { CLIENT_ERROR_CODE } = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const customer = (id) => ({ userId: String(id), name: `Pelanggan ${id}`, role: 'customer' });
const otherTabWrites = (user, token) => store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
const cartOf = (key) => JSON.parse(store.get(key) ?? '[]');
const idsOf = (items) => items.map((i) => i.cart_item_id);
const ORDER_OK = { status: 201, body: { data: { order_number: 'OVC-261023-002', payment_option: 'online' } } };
const orderInput = (items) => ({ items, fulfillment: 'pickup', method_code: 'qris' });
const CROISSANT = { product_id: 1, name: 'Croissant', price: 28000 };
const BOLU = { product_id: 2, name: 'Bolu', price: 30000 };
const LEGACY = [{ product_id: 1, quantity: 2, name: 'Croissant' }, { product_id: 2, quantity: 1, name: 'Bolu' }];

function signIn(user, token) {
  useAuthStore.getState().setAuth(user, token);
  useCartStore.getState().loadCartForUser(user);
}
/** Yang dilakukan PembayaranPage setelah createOrder berhasil (snapshot diambil sebelum request) */
const completeCheckout = (orderedItems) => useCartStore.getState().removeOrderedItems(toOrderedLines(orderedItems));
/** Tab lain (pelanggan yang sama) menambah item selama request pesanan berjalan */
const otherTabAdds = (item) => () => {
  otherTabCart.getState().loadUserCart('1');
  otherTabCart.getState().addItem(item);
};

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  otherTabCart.getState().resetToGuest();
});

// ── M-1: id keranjang lama stabil ─────────────────────────────────────────────────────────────────────────────────

test('M-1: data lama tanpa cart_item_id dinormalisasi & disimpan SEKALI; id stabil di pembacaan berikutnya', async () => {
  store.set('ovenco_mock_cart_1', JSON.stringify(LEGACY));
  useCartStore.getState().loadUserCart('1');
  const ids = idsOf(useCartStore.getState().items);
  assert.equal(ids.every(Number.isFinite), true);
  assert.deepEqual(idsOf(cartOf('ovenco_mock_cart_1')), ids);

  // Pembacaan berikutnya (waktu berbeda, tab lain) memberi id yang sama dan tidak menulis ulang keranjang valid
  await new Promise((resolve) => setTimeout(resolve, 5));
  const writes = globalThis.localStorage.writes();
  otherTabCart.getState().loadUserCart('1');
  useCartStore.getState().reloadActiveCart();
  useCartStore.getState().loadUserCart('1');
  assert.deepEqual(idsOf(otherTabCart.getState().items), ids);
  assert.deepEqual(idsOf(useCartStore.getState().items), ids);
  assert.equal(globalThis.localStorage.writes(), writes);
});

test('M-1: item lama langsung bisa dihapus pada operasi PERTAMA setelah dimuat', async () => {
  store.set('ovenco_mock_cart_1', JSON.stringify(LEGACY));
  useCartStore.getState().loadUserCart('1');
  const [croissant, bolu] = useCartStore.getState().items;
  await new Promise((resolve) => setTimeout(resolve, 5));

  useCartStore.getState().removeItem(croissant.cart_item_id);
  assert.deepEqual(idsOf(cartOf('ovenco_mock_cart_1')), [bolu.cart_item_id]);
  assert.deepEqual(idsOf(useCartStore.getState().items), [bolu.cart_item_id]);
});

test('M-1: jumlah item lama langsung bisa diubah pada operasi PERTAMA setelah dimuat', async () => {
  store.set('ovenco_mock_cart_1', JSON.stringify(LEGACY));
  useCartStore.getState().loadUserCart('1');
  const [croissant] = useCartStore.getState().items;
  await new Promise((resolve) => setTimeout(resolve, 5));

  useCartStore.getState().updateQuantity(croissant.cart_item_id, 5);
  const saved = cartOf('ovenco_mock_cart_1');
  assert.deepEqual(saved.map((i) => [i.cart_item_id, i.quantity]), [[croissant.cart_item_id, 5], [saved[1].cart_item_id, 1]]);
});

test('M-1: cart_item_id ganda → item & jumlah utuh, id unik disimpan, baris kedua bisa dihapus sendiri', () => {
  store.set('ovenco_mock_cart_1', JSON.stringify([
    { cart_item_id: 10, product_id: 1, quantity: 2 }, { cart_item_id: 10, product_id: 2, quantity: 3 },
  ]));
  useCartStore.getState().loadUserCart('1');
  const items = useCartStore.getState().items;
  assert.deepEqual(items.map((i) => [i.product_id, i.quantity]), [[1, 2], [2, 3]]);
  assert.equal(items[0].cart_item_id, 10);
  assert.equal(new Set(idsOf(items)).size, 2);
  assert.deepEqual(idsOf(cartOf('ovenco_mock_cart_1')), idsOf(items));

  useCartStore.getState().removeItem(items[1].cart_item_id);
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => [i.cart_item_id, i.product_id]), [[10, 1]]);
});

// ── M-2: pesanan berhasil mengurangi jumlah yang dipesan ─────────────────────────────────────────────────────────

test('M-2: dipesan 2, tab lain menambah 3 selama request (jadi 5) → setelah berhasil tersisa 3', async () => {
  signIn(customer(1), 'jwt-A');
  useCartStore.getState().addItem({ ...CROISSANT, quantity: 2 });
  const snapshot = useCartStore.getState().items;
  scriptFetch([{ before: otherTabAdds({ ...CROISSANT, quantity: 3 }), ...ORDER_OK }]);

  await createOrder(orderInput(snapshot));
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => i.quantity), [5]);
  completeCheckout(snapshot);
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => [i.cart_item_id, i.quantity]), [[snapshot[0].cart_item_id, 3]]);
  assert.deepEqual(useCartStore.getState().items.map((i) => i.quantity), [3]);
});

test('M-2: item BERBEDA yang ditambahkan selama checkout tetap di keranjang', async () => {
  signIn(customer(1), 'jwt-A');
  useCartStore.getState().addItem({ ...CROISSANT, quantity: 2 });
  const snapshot = useCartStore.getState().items;
  scriptFetch([{ before: otherTabAdds(BOLU), ...ORDER_OK }]);

  await createOrder(orderInput(snapshot));
  completeCheckout(snapshot);
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => [i.product_id, i.quantity]), [[2, 1]]);
});

test('M-2: jumlah terkini lebih kecil dari yang dipesan → baris dihapus, tidak pernah negatif', () => {
  const items = [{ cart_item_id: 1, product_id: 1, quantity: 1 }, { cart_item_id: 2, product_id: 2, quantity: 4 }];
  assert.deepEqual(subtractOrderedItems(items, [{ cart_item_id: 1, quantity: 3 }, { cart_item_id: 2, quantity: 4 }]), []);
  assert.deepEqual(subtractOrderedItems(items, [{ cart_item_id: 9, quantity: 1 }]), items);
});

test('M-2: request checkout GAGAL / jaringan putus → keranjang tidak berubah', async () => {
  signIn(customer(1), 'jwt-A');
  useCartStore.getState().addItem({ ...CROISSANT, quantity: 2 });
  const before = store.get('ovenco_mock_cart_1');
  const snapshot = useCartStore.getState().items;

  scriptFetch([{ status: 409, body: { message: 'Stok habis' } }]);
  await assert.rejects(createOrder(orderInput(snapshot)), { status: 409 });
  scriptFetch([{ networkError: true }]);
  await assert.rejects(createOrder(orderInput(snapshot)), TypeError);
  // Akun lain aktif + respons gagal → tidak ada rekonsiliasi
  scriptFetch([{ before: () => otherTabWrites(customer(2), 'jwt-B'), status: 409, body: { message: 'Stok habis' } }]);
  await assert.rejects(createOrder(orderInput(snapshot)), { code: CLIENT_ERROR_CODE.SESSION_CHANGED });

  assert.equal(store.get('ovenco_mock_cart_1'), before);
});

test('M-2: pesanan A berhasil saat B aktif → hanya jumlah yang dipesan dikurangi dari keranjang A; B & tamu utuh', async () => {
  signIn(customer(1), 'jwt-A');
  store.set('ovenco_mock_cart_1', JSON.stringify([
    { cart_item_id: 1, product_id: 1, quantity: 5 }, { cart_item_id: 2, product_id: 2, quantity: 1 },
  ]));
  // Keranjang B & tamu sengaja memakai cart_item_id yang sama
  const cartB = JSON.stringify([{ cart_item_id: 1, product_id: 7, quantity: 2 }]);
  const cartGuest = JSON.stringify([{ cart_item_id: 1, product_id: 8, quantity: 1 }]);
  store.set('ovenco_mock_cart_2', cartB);
  store.set('ovenco_mock_cart_guest', cartGuest);
  useCartStore.getState().loadCartForUser(customer(1));
  const snapshot = [{ ...useCartStore.getState().items[0], quantity: 2 }];
  scriptFetch([{ before: () => otherTabWrites(customer(2), 'jwt-B'), ...ORDER_OK }]);

  await assert.rejects(createOrder(orderInput(snapshot)), { code: CLIENT_ERROR_CODE.SESSION_CHANGED_COMMITTED });
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => [i.cart_item_id, i.quantity]), [[1, 3], [2, 1]]);
  assert.equal(store.get('ovenco_mock_cart_2'), cartB);
  assert.equal(store.get('ovenco_mock_cart_guest'), cartGuest);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.quantity), [2]);

  // Pemilik bukan pelanggan (staf / tidak diketahui) → tidak menyentuh keranjang mana pun
  useCartStore.getState().removeOrderedItemsFromOwnerCart(null, [{ cart_item_id: 1, quantity: 1 }]);
  assert.equal(store.get('ovenco_mock_cart_guest'), cartGuest);
  assert.equal(store.get('ovenco_mock_cart_2'), cartB);
});
