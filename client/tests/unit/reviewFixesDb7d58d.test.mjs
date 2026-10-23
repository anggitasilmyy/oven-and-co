// Uji regresi review commit db7d58d — H1 (desain tamu masuk keranjang akun lain), M1 (ubah profil di tab lain
// membatalkan request), L1 (draft checkout tidak direset saat identitas berganti).
// Menguji jalur aslinya: saveCustomCakeToCart + apiClient + store, runMockRequest + handler mock, startSessionScope.
// SIMULASI Node: "tab lain" = menulis sesi kanonis "ovenco_auth" seperti persist Zustand. Bukan bukti browser nyata.

import test from 'node:test';
import assert from 'node:assert/strict';

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

const calls = [];
function scriptFetch(steps) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`fetch tak terduga ke ${url}`);
    step.before?.();
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body };
  };
}

const { apiClient } = await import('../../src/services/apiClient.js');
const { saveCustomCakeToCart, DESIGN_CART_TARGET } = await import('../../src/services/customCakeCartService.js');
const { createMockCustomCakeDesign } = await import('../../src/services/customCakeService.js');
const { runMockRequest } = await import('../../src/services/sessionRecovery.js');
const { syncSessionFromStorage } = await import('../../src/services/sessionSync.js');
const { startSessionScope } = await import('../../src/services/sessionScope.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const { default: useCheckoutStore } = await import('../../src/stores/useCheckoutStore.js');
const { getTables } = await import('../../src/services/mock/db.js');
const { getMockCurrentTime } = await import('../../src/services/mock/mockClock.js');
const { groupCustomOptions, getEarliestReadyDate } = await import('../../src/utils/businessRules.js');
const { CLIENT_ERROR_CODE, SESSION_CHANGED_MESSAGE } = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };
const apiCustomer = (id, extra = {}) => ({ userId: String(id), name: `Pelanggan ${id}`, role: 'customer', ...extra });
const otherTabWrites = (user, token) => store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
const cartDesigns = (key) => JSON.parse(store.get(key) ?? '[]').map((i) => i.design_id);
const PRODUCT = { product_id: 6, name: 'Custom Celebration Cake', image_url: '/images/products/custom-cake-1.webp' };
const DESIGN = { selections: {}, writingText: '', writingColor: 'Cokelat', referencePhoto: null, readyDate: '2026-10-30' };

let stopScope = () => {};

test.beforeEach(() => {
  stopScope();
  store.clear();
  globalThis.sessionStorage.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  useCheckoutStore.getState().resetCheckout();
});

// ── H1: desain tamu & keranjang ───────────────────────────────────────────────────────────────────────────────────

test('H1 (API): tamu menyimpan desain, pelanggan Y login di tab lain selama request → desain masuk keranjang TAMU, keranjang Y utuh', async () => {
  store.set('ovenco_mock_cart_7', JSON.stringify([{ cart_item_id: 1, product_id: 2, quantity: 1 }]));
  scriptFetch([{
    before: () => otherTabWrites(apiCustomer(7), 'jwt-Y'),
    status: 201, body: { data: { design_id: '55', price: 525000, ready_date: '2026-10-30', design_token: 'tok-tamu' } },
  }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);

  assert.equal(result.target, DESIGN_CART_TARGET.ORIGINAL_OWNER);
  assert.equal(result.added, true);
  assert.equal(result.saved.design_id, '55'); // hasil tidak dibuang: desain tamu memang sah
  // Keranjang Y: tetap satu item lamanya, tanpa desain tamu
  assert.equal(JSON.parse(store.get('ovenco_mock_cart_7')).length, 1);
  assert.ok(!cartDesigns('ovenco_mock_cart_7').includes('55'));
  const guestCart = JSON.parse(store.get('ovenco_mock_cart_guest'));
  assert.deepEqual(guestCart.map((i) => [i.design_id, i.design_token]), [['55', 'tok-tamu']]);
  // Tab ini kini mengikuti sesi Y, keranjang aktif = keranjang Y (tanpa desain tamu)
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_7');
  assert.ok(!useCartStore.getState().items.some((i) => i.design_id === '55'));
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('H1 (API): identitas tidak berubah → desain masuk keranjang aktif (tamu maupun pelanggan)', async () => {
  scriptFetch([{ status: 201, body: { data: { design_id: '60', price: 1, ready_date: '2026-10-30', design_token: 'tok' } } }]);
  const guest = await saveCustomCakeToCart(DESIGN, PRODUCT);
  assert.equal(guest.target, DESIGN_CART_TARGET.ACTIVE);
  assert.deepEqual(useCartStore.getState().items.map((i) => i.design_id), ['60']);

  useAuthStore.getState().setAuth(apiCustomer(3), 'jwt-3');
  useCartStore.getState().loadCartForUser(apiCustomer(3));
  scriptFetch([{ status: 201, body: { data: { design_id: '61', price: 1, ready_date: '2026-10-30', design_token: null } } }]);
  const customer = await saveCustomCakeToCart(DESIGN, PRODUCT);
  assert.equal(customer.target, DESIGN_CART_TARGET.ACTIVE);
  assert.deepEqual(cartDesigns('ovenco_mock_cart_3'), ['61']);
});

test('H1 (API): pelanggan A menyimpan desain, beralih ke pelanggan B → ditolak, keranjang A & B tidak tersentuh', async () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-A');
  useCartStore.getState().loadCartForUser(apiCustomer(1));
  scriptFetch([{
    before: () => otherTabWrites(apiCustomer(2), 'jwt-B'),
    status: 201, body: { data: { design_id: '70', price: 1, ready_date: '2026-10-30', design_token: null } },
  }]);

  await assert.rejects(saveCustomCakeToCart(DESIGN, PRODUCT), CHANGED);
  assert.equal(store.has('ovenco_mock_cart_1'), false);
  assert.equal(store.has('ovenco_mock_cart_2'), false);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
  assert.equal(useCartStore.getState().items.length, 0);
});

test('H1 (API): batas baris keranjang pemilik asli tetap ditegakkan', async () => {
  const fullGuest = Array.from({ length: 50 }, (_, i) => ({ cart_item_id: i + 1, product_id: 1, quantity: 1, note: `n${i}` }));
  store.set('ovenco_mock_cart_guest', JSON.stringify(fullGuest));
  useCartStore.getState().resetToGuest();
  scriptFetch([{
    before: () => otherTabWrites(apiCustomer(7), 'jwt-Y'),
    status: 201, body: { data: { design_id: '80', price: 1, ready_date: '2026-10-30', design_token: 'tok' } },
  }]);

  const result = await saveCustomCakeToCart(DESIGN, PRODUCT);
  assert.equal(result.added, false);
  assert.equal(JSON.parse(store.get('ovenco_mock_cart_guest')).length, 50);
});

/** Desain sah dari data mock nyata (opsi aktif pertama per kelompok, tanggal tercepat) */
function validMockDesign() {
  const t = getTables('products', 'custom_options', 'store_settings');
  const product = t.products.find((p) => p.is_active && p.availability_type === 'custom');
  const grouped = groupCustomOptions(t.custom_options);
  const selections = Object.fromEntries(Object.entries(grouped).map(([group, list]) => [group, list[0].option_id]));
  return { ...DESIGN, selections, readyDate: getEarliestReadyDate(product, getMockCurrentTime(), t.store_settings) };
}

test('H1 (mock): desain tamu yang selesai setelah pelanggan Y login tetap tercatat milik TAMU (bukan milik Y)', async () => {
  const design = validMockDesign();
  const pending = runMockRequest(({ sessionUser }) => createMockCustomCakeDesign(design, sessionUser), 5);
  otherTabWrites({ user_id: 7, role: 'customer' }, 'mock_token_7'); // login di tab lain selama jeda

  const saved = await pending;
  const row = getTables('custom_cake_designs').custom_cake_designs.find((d) => d.design_id === saved.design_id);
  assert.equal(row.user_id, null);
  assert.equal(useAuthStore.getState().user.user_id, 7);
});

test('H1 (mock): desain pelanggan yang identitasnya tidak berubah tetap milik pelanggan itu', async () => {
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'mock_token_1');
  const saved = await runMockRequest(({ sessionUser }) => createMockCustomCakeDesign(validMockDesign(), sessionUser), 1);
  const row = getTables('custom_cake_designs').custom_cake_designs.find((d) => d.design_id === saved.design_id);
  assert.equal(row.user_id, 1);
});

// ── M1: ubah profil di tab lain ≠ pergantian sesi ─────────────────────────────────────────────────────────────────

test('M1: profil diubah di tab lain (token & id sama) → request berikutnya TETAP dikirim, profil tersinkron', async () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  otherTabWrites(apiCustomer(1, { name: 'Nama Baru', email: 'baru@contoh.id' }), 'jwt-1');
  scriptFetch([{ status: 200, body: { data: 'ok' } }]);

  assert.equal(await apiClient('/me/profile'), 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-1');
  assert.equal(useAuthStore.getState().user.name, 'Nama Baru');
});

test('M1: profil diubah di tab lain SELAMA request → respons tetap dikembalikan', async () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  scriptFetch([{ before: () => otherTabWrites(apiCustomer(1, { name: 'Lain' }), 'jwt-1'), status: 200, body: { data: 'ok' } }]);
  assert.equal(await apiClient('/me/orders'), 'ok');
});

test('M1 (mock): profil diubah di tab lain → request mock tetap dijalankan', async () => {
  useAuthStore.getState().setAuth({ user_id: 1, name: 'A', role: 'customer' }, 'mock_token_1');
  otherTabWrites({ user_id: 1, name: 'A baru', role: 'customer' }, 'mock_token_1');
  assert.equal(await runMockRequest(() => 'jalan', 1), 'jalan');
});

test('M1: pergantian sesi sungguhan (token atau pengguna lain) tetap membatalkan request ber-identitas', async () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  otherTabWrites(apiCustomer(1), 'jwt-1-baru'); // token baru
  scriptFetch([]);
  await assert.rejects(apiClient('/me/profile'), CHANGED);

  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  otherTabWrites(apiCustomer(2), 'jwt-2'); // pengguna lain
  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 0);

  const profileOnly = (() => {
    otherTabWrites(apiCustomer(2, { name: 'X' }), 'jwt-2');
    return syncSessionFromStorage();
  })();
  assert.deepEqual(profileOnly, { changed: true, sessionChanged: false });
});

// ── L1: draft checkout ────────────────────────────────────────────────────────────────────────────────────────────

const draftOf = () => {
  const { addressId, voucherCode, usePoints, ownerKey } = useCheckoutStore.getState();
  return { addressId, voucherCode, usePoints, ownerKey };
};

test('L1: draft checkout dicap milik identitas dan DIRESET saat pengguna lain masuk dari tab lain', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  stopScope = startSessionScope();
  useCheckoutStore.getState().setCheckout({ addressId: 'alamat-A', voucherCode: 'KODE-A', usePoints: true });
  assert.deepEqual(draftOf(), { addressId: 'alamat-A', voucherCode: 'KODE-A', usePoints: true, ownerKey: '1' });

  otherTabWrites(apiCustomer(2), 'jwt-2');
  syncSessionFromStorage();
  assert.deepEqual(draftOf(), { addressId: null, voucherCode: null, usePoints: false, ownerKey: null });
});

test('L1: draft TIDAK direset saat profil atau token pengguna yang sama berubah', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  stopScope = startSessionScope();
  useCheckoutStore.getState().setCheckout({ addressId: 'alamat-A', voucherCode: 'KODE-A' });

  useAuthStore.getState().updateCurrentUser(apiCustomer(1, { name: 'Nama Baru' })); // ubah profil di tab ini
  otherTabWrites(apiCustomer(1, { name: 'Nama Lain' }), 'jwt-1'); // ubah profil di tab lain
  syncSessionFromStorage();
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1-baru'); // masuk lagi sebagai pengguna yang sama

  assert.equal(useCheckoutStore.getState().addressId, 'alamat-A');
  assert.equal(useCheckoutStore.getState().voucherCode, 'KODE-A');
});

test('L1: draft direset saat logout / sesi kedaluwarsa di tab ini, dan draft milik identitas lain dibuang saat mulai', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  stopScope = startSessionScope();
  useCheckoutStore.getState().setCheckout({ voucherCode: 'KODE-A' });
  useAuthStore.getState().logout();
  assert.equal(useCheckoutStore.getState().voucherCode, null);

  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  useCheckoutStore.getState().setCheckout({ voucherCode: 'KODE-A' });
  useAuthStore.getState().expireSession();
  assert.equal(useCheckoutStore.getState().voucherCode, null);

  // Draft tersimpan (sessionStorage) milik pengguna 1, tab dimuat ulang sebagai pengguna 2
  stopScope();
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  useCheckoutStore.getState().setCheckout({ voucherCode: 'KODE-A' });
  useAuthStore.setState({ user: apiCustomer(2), token: 'jwt-2' });
  stopScope = startSessionScope();
  assert.equal(useCheckoutStore.getState().voucherCode, null);
});
