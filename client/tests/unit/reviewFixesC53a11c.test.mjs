// Uji regresi review commit c53a11c — M1 (mutasi yang sudah berhasil di server saat sesi berganti) dan M2 (keranjang
// antar-tab). Menguji jalur aslinya: createOrder / saveCustomCakeToCart → apiClient → sessionRecovery → store.
// SIMULASI Node: "tab lain" = (a) menulis sesi kanonis "ovenco_auth", atau (b) instance KEDUA useCartStore (modul yang
// sama diimpor ulang dengan query, berbagi localStorage yang sama seperti dua tab browser). Event `storage` dikirim ke
// pendengar startSessionSync lewat jendela palsu. Bukan bukti browser nyata.

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

const { apiClient } = await import('../../src/services/apiClient.js');
const { createOrder } = await import('../../src/services/orderService.js');
const { saveCustomCakeToCart, DESIGN_CART_TARGET } = await import('../../src/services/customCakeCartService.js');
const { createSessionBoundNotifier } = await import('../../src/services/sessionScope.js');
const { startSessionSync } = await import('../../src/services/sessionSync.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { default: useNoticeStore } = await import('../../src/stores/useNoticeStore.js');
// Tab kedua: instance store terpisah (state memori sendiri), localStorage bersama
const { default: otherTabCart } = await import('../../src/stores/useCartStore.js?tab=kedua');
const { isCommittedForOtherSessionError } = await import('../../src/utils/apiErrors.js');
const {
  CLIENT_ERROR_CODE, SESSION_CHANGED_MESSAGE, SESSION_CHANGED_COMMITTED_MESSAGE, API_ERROR_CODE,
} = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };
const COMMITTED = {
  status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED_COMMITTED, message: SESSION_CHANGED_COMMITTED_MESSAGE,
};
const SESSION_INVALID = { status: 401, body: { status: 'error', code: API_ERROR_CODE.SESSION_INVALID, message: 'x' } };
const customer = (id) => ({ userId: String(id), name: `Pelanggan ${id}`, role: 'customer' });
const otherTabWrites = (user, token) => store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
const cartOf = (key) => JSON.parse(store.get(key) ?? '[]');
const line = (id, productId, extra = {}) => ({ cart_item_id: id, product_id: productId, quantity: 1, ...extra });
const ORDER_OK = { status: 201, body: { data: { order_number: 'OVC-261023-001', payment_option: 'online' } } };
const PRODUCT = { product_id: 6, name: 'Custom Celebration Cake', image_url: '/images/products/custom-cake-1.webp' };
const DESIGN = { selections: {}, writingText: '', writingColor: 'Cokelat', referencePhoto: null, readyDate: '2026-10-30' };

function signIn(user, token) {
  useAuthStore.getState().setAuth(user, token);
  useCartStore.getState().loadCartForUser(user);
}
/** Keluar lalu masuk lagi sebagai pengguna yang sama (token baru) — mis. di tab lain */
const reLogin = (user, token) => () => {
  useAuthStore.getState().logout();
  useCartStore.getState().loadCartForUser(null);
  signIn(user, token);
};
const orderInput = (items) => ({ items, fulfillment: 'pickup', method_code: 'qris' });

// Jendela palsu: pendengar startSessionSync menerima event `storage` seperti di browser
const listeners = new Map();
const fakeWindow = {
  addEventListener: (type, fn) => listeners.set(type, fn),
  removeEventListener: (type) => listeners.delete(type),
};
const deliverStorage = (key) => listeners.get('storage')?.({ key });
let stopSync = () => {};

test.beforeEach(() => {
  stopSync();
  store.clear();
  globalThis.sessionStorage.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  otherTabCart.getState().resetToGuest();
  useNoticeStore.getState().dismissNotice();
  stopSync = startSessionSync({ win: fakeWindow, doc: null });
});

// ── M1: mutasi berhasil, sesi berganti saat request berjalan ──────────────────────────────────────────────────────

test('M1: POST pesanan berhasil, pengguna SAMA keluar-masuk lagi → hasil dipakai, halaman ditandai dipasang ulang', async () => {
  signIn(customer(1), 'jwt-A');
  store.set('ovenco_mock_cart_1', JSON.stringify([line(1, 1), line(2, 2)]));
  useCartStore.getState().loadCartForUser(customer(1));
  const report = createSessionBoundNotifier(() => {});
  scriptFetch([{ before: reLogin(customer(1), 'jwt-A2'), ...ORDER_OK }]);

  const result = await createOrder(orderInput(useCartStore.getState().items));
  assert.equal(result.order_number, 'OVC-261023-001');
  assert.equal(calls.length, 1);
  // Halaman pembayaran sudah dipasang ulang → pesan sukses lewat notifikasi global, item yang dipesan dihapus
  assert.equal(report.isPageReplaced(), true);
  report('success', 'Pesanan dibuat');
  assert.equal(useNoticeStore.getState().notice.message, 'Pesanan dibuat');
  useCartStore.getState().removeItems([1, 2]);
  assert.deepEqual(cartOf('ovenco_mock_cart_1'), []);
});

test('M1: POST pesanan berhasil, akun BERBEDA aktif → tidak ada detail untuk B, keranjang B utuh, item A yang dipesan dihapus', async () => {
  signIn(customer(1), 'jwt-A');
  store.set('ovenco_mock_cart_1', JSON.stringify([line(1, 1), line(2, 2)]));
  const cartB = JSON.stringify([line(9, 7)]);
  store.set('ovenco_mock_cart_2', cartB);
  useCartStore.getState().loadCartForUser(customer(1));
  // Yang dipesan hanya baris 1; baris 2 ditambahkan setelah checkout dimulai dan harus tetap ada
  const ordered = [useCartStore.getState().items[0]];
  scriptFetch([{ before: () => otherTabWrites(customer(2), 'jwt-B'), ...ORDER_OK }]);

  const error = await createOrder(orderInput(ordered)).catch((e) => e);
  assert.deepEqual({ status: error.status, code: error.code, message: error.message }, COMMITTED);
  assert.equal(isCommittedForOtherSessionError(error), true);
  assert.ok(!error.message.includes('OVC-'));
  assert.equal(calls.length, 1);
  assert.equal(store.get('ovenco_mock_cart_2'), cartB);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.cart_item_id), [9]);
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => i.cart_item_id), [2]);
});

test('M1: POST pesanan berhasil, akun keluar (tanpa sesi) → COMMITTED, keranjang pemilik dirapikan, keranjang tamu utuh', async () => {
  signIn(customer(1), 'jwt-A');
  store.set('ovenco_mock_cart_1', JSON.stringify([line(1, 1)]));
  store.set('ovenco_mock_cart_guest', JSON.stringify([line(4, 3)]));
  useCartStore.getState().loadCartForUser(customer(1));
  scriptFetch([{ before: () => store.delete(AUTH_PERSIST_KEY), ...ORDER_OK }]);

  await assert.rejects(createOrder(orderInput(useCartStore.getState().items)), COMMITTED);
  assert.deepEqual(cartOf('ovenco_mock_cart_1'), []);
  assert.deepEqual(cartOf('ovenco_mock_cart_guest').map((i) => i.cart_item_id), [4]);
});

test('M1: respons GAGAL tetap kegagalan — pengguna sama → error server; akun lain → CHANGED; keranjang tidak berubah', async () => {
  signIn(customer(1), 'jwt-A');
  const cartA = JSON.stringify([line(1, 1)]);
  store.set('ovenco_mock_cart_1', cartA);
  useCartStore.getState().loadCartForUser(customer(1));
  scriptFetch([{ before: reLogin(customer(1), 'jwt-A2'), status: 409, body: { message: 'Stok habis' } }]);
  await assert.rejects(createOrder(orderInput(useCartStore.getState().items)), { status: 409, message: 'Stok habis' });
  assert.equal(store.get('ovenco_mock_cart_1'), cartA);

  scriptFetch([{ before: () => otherTabWrites(customer(2), 'jwt-B'), status: 409, body: { message: 'Stok habis' } }]);
  await assert.rejects(createOrder(orderInput(cartOf('ovenco_mock_cart_1'))), CHANGED);
  assert.equal(store.get('ovenco_mock_cart_1'), cartA);
});

test('M1: hasil tidak diketahui (jaringan putus / 401 token lama) → tidak pernah dikirim ulang otomatis', async () => {
  signIn(customer(1), 'jwt-A');
  scriptFetch([{ networkError: true }]);
  await assert.rejects(createOrder(orderInput([line(1, 1)])), TypeError);
  assert.equal(calls.length, 1);

  // 401 untuk token lama setelah masuk lagi: mutasi belum tersimpan, tetap tidak diulang dengan token baru
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    calls.length = 0;
    signIn(customer(1), 'jwt-A');
    scriptFetch([{ before: reLogin(customer(1), 'jwt-A2'), ...SESSION_INVALID }]);
    await assert.rejects(apiClient('/orders', { method, body: {} }), CHANGED);
    assert.equal(calls.length, 1, method);
    assert.equal(useAuthStore.getState().token, 'jwt-A2', method);
  }
});

test('M1: desain akun A tersimpan, pengguna SAMA keluar-masuk lagi → masuk keranjang A (aktif), tidak dianggap gagal', async () => {
  signIn(customer(1), 'jwt-A');
  scriptFetch([{
    before: reLogin(customer(1), 'jwt-A2'),
    status: 201, body: { data: { design_id: '71', price: 1, ready_date: '2026-10-30', design_token: null } },
  }]);
  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);
  assert.equal(result.target, DESIGN_CART_TARGET.ACTIVE);
  assert.deepEqual(cartOf('ovenco_mock_cart_1').map((i) => i.design_id), ['71']);
  assert.equal(calls.length, 1);
});

// ── M2: keranjang antar-tab ───────────────────────────────────────────────────────────────────────────────────────

test('M2: tab lain menulis desain ke keranjang X → event storage memuat ulang keranjang aktif X di tab ini', () => {
  signIn(customer(7), 'jwt-X');
  useCartStore.getState().addItem({ product_id: 1, quantity: 1, name: 'Croissant', price: 28000 });
  otherTabCart.getState().addItemToOwnerCart('7', { product_id: 6, design_id: '90', quantity: 1, price: 1 });

  deliverStorage('ovenco_mock_cart_7');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.design_id), [null, '90']);
});

test('M2: event belum tiba — ubah jumlah / hapus / tambah di tab ini TIDAK menimpa desain dari tab lain', () => {
  signIn(customer(7), 'jwt-X');
  useCartStore.getState().addItem({ product_id: 1, quantity: 1, name: 'Croissant', price: 28000 });
  useCartStore.getState().addItem({ product_id: 2, quantity: 1, name: 'Bolu', price: 30000 });
  const [croissant, bolu] = useCartStore.getState().items;
  otherTabCart.getState().addItemToOwnerCart('7', { product_id: 6, design_id: '91', quantity: 1, price: 1 });

  useCartStore.getState().updateQuantity(croissant.cart_item_id, 3);
  useCartStore.getState().removeItem(bolu.cart_item_id);
  useCartStore.getState().addItem({ product_id: 3, quantity: 1, name: 'Tart', price: 50000 });

  const saved = cartOf('ovenco_mock_cart_7');
  assert.deepEqual(saved.map((i) => [i.product_id, i.quantity]), [[1, 3], [6, 1], [3, 1]]);
  assert.equal(saved.filter((i) => i.design_id === '91').length, 1);
  assert.equal(new Set(saved.map((i) => i.cart_item_id)).size, saved.length);
});

test('M2: event untuk keranjang akun LAIN tidak mengganti keranjang aktif; muat ulang tidak menulis (tanpa loop)', () => {
  signIn(customer(7), 'jwt-X');
  useCartStore.getState().addItem({ product_id: 1, quantity: 1, name: 'Croissant', price: 28000 });
  store.set('ovenco_mock_cart_8', JSON.stringify([line(5, 9)]));

  deliverStorage('ovenco_mock_cart_8');
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_7');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id), [1]);

  const before = globalThis.localStorage.writes();
  deliverStorage('ovenco_mock_cart_7');
  deliverStorage('ovenco_mock_cart_7');
  assert.equal(globalThis.localStorage.writes(), before);
});

test('M2: desain idempoten antar-tab — tab ini yang belum sinkron tidak membuat baris ganda', () => {
  signIn(customer(7), 'jwt-X');
  const item = { product_id: 6, design_id: '92', quantity: 1, price: 1 };
  otherTabCart.getState().addItemToOwnerCart('7', item);
  assert.equal(useCartStore.getState().addItemToOwnerCart('7', item), true);
  assert.equal(cartOf('ovenco_mock_cart_7').length, 1);
});

test('M2: gabung keranjang tamu saat login tetap berjalan, lalu tab lain melihat hasil gabungan lewat event', () => {
  useCartStore.getState().addItem({ product_id: 1, quantity: 2, name: 'Croissant', price: 28000 });
  store.set('ovenco_mock_cart_7', JSON.stringify([line(1, 4)]));
  // Tab lain sudah aktif sebagai X dengan isi lama
  otherTabCart.getState().loadUserCart('7');

  useAuthStore.getState().setAuth(customer(7), 'jwt-X');
  useCartStore.getState().mergeGuestCart('7');
  assert.equal(store.has('ovenco_mock_cart_guest'), false);
  assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id).sort(), [1, 4]);

  // Tab lain menerima event → isinya sama dengan hasil gabung, tanpa duplikasi
  otherTabCart.getState().reloadActiveCart();
  assert.deepEqual(otherTabCart.getState().items, useCartStore.getState().items);
});
