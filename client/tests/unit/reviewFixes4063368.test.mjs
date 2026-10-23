// Uji regresi review commit 4063368 (#1–#10): kepemilikan keranjang, data pengguna lama, mode mock, profil terlambat,
// request tamu/publik, sinkronisasi profil & notifikasi, pageshow/visibilitychange, hidrasi gagal, pembersihan.
// SIMULASI Node: "tab lain" = menulis sesi kanonis "ovenco_auth" seperti persist Zustand. Bukan bukti browser nyata.

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
const { runMockRequest } = await import('../../src/services/sessionRecovery.js');
const { startSessionSync, syncSessionFromStorage } = await import('../../src/services/sessionSync.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const {
  isValidUserId, getSessionUserId, getCartOwnerId, getSessionTreeKey, GUEST_SESSION_KEY,
} = await import('../../src/utils/sessionIdentity.js');
const { isSessionError } = await import('../../src/utils/apiErrors.js');
const { CLIENT_ERROR_CODE, API_ERROR_CODE, SESSION_CHANGED_MESSAGE } = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };
const apiCustomer = (id) => ({ userId: String(id), name: `Pelanggan ${id}`, role: 'customer' }); // bentuk REST API
const mockCustomer = (id) => ({ user_id: id, name: `Pelanggan ${id}`, role: 'customer' }); // bentuk mock

function otherTabWrites(user, token, version = 0) {
  store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version }));
}
const cartItems = (key) => JSON.parse(store.get(key) ?? '[]').map((i) => i.product_id);

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
});

// ── #1 Kepemilikan keranjang ──────────────────────────────────────────────────────────────────────────────────────

test('#1: id pengguna dibaca dari bentuk mock (user_id) & API (userId); id tidak sah ditolak', () => {
  assert.equal(getSessionUserId(mockCustomer(1)), '1');
  assert.equal(getSessionUserId(apiCustomer(1)), '1');
  for (const bad of [undefined, null, '', ' ', 'undefined', 'null', 'NaN', NaN, Infinity]) {
    assert.equal(isValidUserId(bad), false, String(bad));
    assert.equal(getSessionUserId({ user_id: bad, role: 'customer' }), null, String(bad));
  }
  assert.equal(getCartOwnerId(apiCustomer(42)), '42');
  assert.equal(getCartOwnerId({ userId: '2', role: 'staf' }), null); // staf/owner tanpa keranjang akun
  assert.equal(getCartOwnerId(null), null);
});

test('#1: login bentuk API menggabungkan keranjang tamu ke keranjang akun yang benar, BUKAN "ovenco_mock_cart_undefined"', () => {
  useCartStore.getState().addItem({ product_id: 9, quantity: 1, name: 'Roti', price: 15000 });
  useAuthStore.getState().setAuth(apiCustomer(42), 'jwt-42');
  useCartStore.getState().mergeGuestCart(getCartOwnerId(apiCustomer(42))); // alur MasukPage/DaftarPage

  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_42');
  assert.deepEqual(cartItems('ovenco_mock_cart_42'), [9]);
  assert.equal(store.has('ovenco_mock_cart_undefined'), false);
});

test('#1: id tidak sah tidak pernah memakai key bersama; keranjang tamu tetap utuh', () => {
  useCartStore.getState().addItem({ product_id: 9, quantity: 1, name: 'Roti', price: 15000 });
  useCartStore.getState().mergeGuestCart(undefined);
  useCartStore.getState().mergeGuestCart('undefined');
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.deepEqual(cartItems('ovenco_mock_cart_guest'), [9]);

  useCartStore.getState().loadUserCart(undefined);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.ok(![...store.keys()].some((key) => /cart_(undefined|null|NaN)$/.test(key)));
});

test('#1: dua pelanggan bergantian di satu perangkat (bentuk API) tidak pernah berbagi keranjang', () => {
  // Pelanggan 3
  useCartStore.getState().addItem({ product_id: 1, quantity: 2, name: 'Croissant', price: 28000 });
  useAuthStore.getState().setAuth(apiCustomer(3), 'jwt-3');
  useCartStore.getState().mergeGuestCart(getCartOwnerId(apiCustomer(3)));
  useAuthStore.getState().logout();
  useCartStore.getState().resetToGuest();

  // Pelanggan 7 dengan keranjang tamu baru
  useCartStore.getState().addItem({ product_id: 5, quantity: 1, name: 'Cookies', price: 120000 });
  useAuthStore.getState().setAuth(apiCustomer(7), 'jwt-7');
  useCartStore.getState().mergeGuestCart(getCartOwnerId(apiCustomer(7)));

  assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id), [5]);
  assert.deepEqual(cartItems('ovenco_mock_cart_3'), [1]);
  assert.deepEqual(cartItems('ovenco_mock_cart_7'), [5]);
});

test('#1: login tab ini & sinkron tab lain memakai key keranjang yang SAMA (mock & API), staf → keranjang tamu', () => {
  for (const [user, key] of [[apiCustomer(42), 'ovenco_mock_cart_42'], [mockCustomer(42), 'ovenco_mock_cart_42']]) {
    useAuthStore.setState({ user: null, token: null });
    useCartStore.getState().resetToGuest();
    otherTabWrites(user, `jwt-${Math.random()}`);
    syncSessionFromStorage();
    assert.equal(useCartStore.getState()._storageKey, key);
  }

  useCartStore.getState().loadCartForUser({ userId: '2', role: 'owner' });
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
});

// ── #2/#4 Data pengguna lama ──────────────────────────────────────────────────────────────────────────────────────

test('#2: kunci pohon halaman berubah hanya bila identitas berubah (bukan saat token diperbarui)', () => {
  assert.equal(getSessionTreeKey(null), GUEST_SESSION_KEY);
  assert.equal(getSessionTreeKey(mockCustomer(1)), getSessionTreeKey(apiCustomer(1))); // pengguna sama, bentuk beda
  assert.notEqual(getSessionTreeKey(apiCustomer(1)), getSessionTreeKey(apiCustomer(2)));
  assert.notEqual(getSessionTreeKey(apiCustomer(1)), GUEST_SESSION_KEY);
  assert.equal(getSessionTreeKey({ role: 'customer' }), GUEST_SESSION_KEY); // tanpa id sah → tidak dianggap pengguna
});

test('#4: error sesi dikenali agar useServiceQuery membuang data sesi sebelumnya', () => {
  assert.equal(isSessionError({ code: CLIENT_ERROR_CODE.SESSION_CHANGED }), true);
  assert.equal(isSessionError({ code: CLIENT_ERROR_CODE.SESSION_EXPIRED }), true);
  assert.equal(isSessionError({ code: API_ERROR_CODE.SESSION_INVALID }), false);
  assert.equal(isSessionError(new Error('jaringan')), false);
  assert.equal(isSessionError(null), false);
});

// ── #3 Mode mock ──────────────────────────────────────────────────────────────────────────────────────────────────

test('#3: mode mock — identitas berganti selama jeda → handler TIDAK dijalankan, CLIENT_SESSION_CHANGED', async () => {
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1');
  let ran = false;
  const pending = runMockRequest(() => { ran = true; return 'data pelanggan 1'; }, 5);
  otherTabWrites(mockCustomer(2), 'mock_token_2'); // tab lain beralih ke pelanggan 2

  await assert.rejects(pending, CHANGED);
  assert.equal(ran, false);
  assert.equal(useAuthStore.getState().user.user_id, 2);
});

test('#3: mode mock — tab tidak sinkron sebelum mulai → request akun dibatalkan sebelum handler', async () => {
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1');
  otherTabWrites(null, null); // logout di tab lain, event belum diproses
  let ran = false;

  await assert.rejects(runMockRequest(() => { ran = true; }, 1), CHANGED);
  assert.equal(ran, false);
});

test('#3: mode mock — request tamu tetap berjalan walau ada login; pengguna sama (token baru) tetap berjalan', async () => {
  const guest = runMockRequest(() => 'katalog', 5);
  otherTabWrites(mockCustomer(1), 'mock_token_1');
  assert.equal(await guest, 'katalog');

  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1');
  const same = runMockRequest(() => 'profil 1', 5);
  useAuthStore.getState().setAuth(mockCustomer(1), 'mock_token_1b');
  assert.equal(await same, 'profil 1');
});

// ── #5 Profil terlambat ───────────────────────────────────────────────────────────────────────────────────────────

test('#5: updateCurrentUser memperbarui profil pengguna yang sama TANPA mengganti token yang lebih baru', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-lama');
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-baru'); // login ulang di tengah penyimpanan

  assert.equal(useAuthStore.getState().updateCurrentUser({ ...apiCustomer(1), name: 'Nama Baru' }), true);
  assert.equal(useAuthStore.getState().user.name, 'Nama Baru');
  assert.equal(useAuthStore.getState().token, 'jwt-baru');
  assert.equal(JSON.parse(store.get(AUTH_PERSIST_KEY)).state.token, 'jwt-baru');
});

test('#5: respons profil terlambat milik A tidak menimpa sesi/profil B, dan diabaikan setelah logout', () => {
  useAuthStore.getState().setAuth(apiCustomer(2), 'jwt-B');
  assert.equal(useAuthStore.getState().updateCurrentUser({ ...apiCustomer(1), name: 'Data A' }), false);
  assert.equal(useAuthStore.getState().user.name, 'Pelanggan 2');
  assert.equal(useAuthStore.getState().token, 'jwt-B');

  useAuthStore.getState().logout();
  assert.equal(useAuthStore.getState().updateCurrentUser(apiCustomer(2)), false);
  assert.equal(useAuthStore.getState().user, null);

  // Bentuk mock vs API untuk pengguna yang sama tetap dianggap sama
  useAuthStore.getState().setAuth(mockCustomer(5), 'mock_token_5');
  assert.equal(useAuthStore.getState().updateCurrentUser({ ...apiCustomer(5), name: 'Lima' }), true);
});

// ── #6 Request tamu/publik ────────────────────────────────────────────────────────────────────────────────────────

test('#6: request publik dimulai sebagai tamu tetap mengembalikan hasil walau pengguna login saat berjalan', async () => {
  scriptFetch([{ before: () => otherTabWrites(apiCustomer(1), 'jwt-1'), status: 200, body: { data: [{ product_id: '1' }] } }]);

  assert.deepEqual(await apiClient('/products'), [{ product_id: '1' }]);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('#6: /auth/login dari tab tamu tetap dikirim (tanpa token) & hasilnya kembali walau tab lain baru login', async () => {
  otherTabWrites(apiCustomer(1), 'jwt-1'); // event belum diproses tab ini
  scriptFetch([{ status: 200, body: { data: { user: apiCustomer(2), token: 'jwt-2' } } }]);

  const result = await apiClient('/auth/login', { method: 'POST', body: { identifier: 'b', password: 'x' } });
  assert.equal(result.token, 'jwt-2');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('#6: request terautentikasi tetap dilindungi dari respons lintas pengguna', async () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  scriptFetch([{ before: () => otherTabWrites(apiCustomer(2), 'jwt-2'), status: 200, body: { data: { name: 'Pelanggan 1' } } }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
});

// ── #7 Sinkron profil & notifikasi ────────────────────────────────────────────────────────────────────────────────

test('#7: perubahan profil di tab lain (token sama) ikut disinkronkan tanpa memuat ulang keranjang', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  useCartStore.getState().loadCartForUser(apiCustomer(1));
  useCartStore.getState().addItem({ product_id: 3, quantity: 1, name: 'Sourdough', price: 55000 });
  useCartStore.setState({ items: [...useCartStore.getState().items, { cart_item_id: 99, product_id: 4, quantity: 1 }] });

  otherTabWrites({ ...apiCustomer(1), name: 'Nama Diubah' }, 'jwt-1');
  assert.equal(syncSessionFromStorage().changed, true);
  assert.equal(useAuthStore.getState().user.name, 'Nama Diubah');
  assert.equal(useCartStore.getState().items.length, 2); // pemilik sama → store keranjang tidak dimuat ulang
});

test('#7: notifikasi "sesi berakhir" lama dihapus saat sesi baru datang dari tab lain, tidak saat logout', () => {
  useAuthStore.setState({ sessionExpired: true });
  otherTabWrites(apiCustomer(3), 'jwt-3');
  syncSessionFromStorage();
  assert.equal(useAuthStore.getState().sessionExpired, false);

  useAuthStore.getState().setAuth(apiCustomer(3), 'jwt-3');
  useAuthStore.setState({ sessionExpired: true });
  otherTabWrites(null, null);
  syncSessionFromStorage();
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

// ── #8 pageshow / visibilitychange ────────────────────────────────────────────────────────────────────────────────

test('#8: pageshow & visibilitychange (terlihat) memicu sinkron; semua pendengar dilepas', () => {
  const winListeners = new Map();
  const docListeners = new Map();
  const target = (map) => ({
    addEventListener: (type, fn) => map.set(type, fn),
    removeEventListener: (type, fn) => { if (map.get(type) === fn) map.delete(type); },
  });
  const doc = { ...target(docListeners), visibilityState: 'hidden' };
  const stop = startSessionSync({ win: target(winListeners), doc });
  assert.deepEqual([...winListeners.keys()].sort(), ['pageshow', 'storage']);
  assert.deepEqual([...docListeners.keys()], ['visibilitychange']);

  otherTabWrites(apiCustomer(1), 'jwt-1');
  winListeners.get('pageshow')({ persisted: true }); // dipulihkan dari bfcache
  assert.equal(useAuthStore.getState().token, 'jwt-1');

  otherTabWrites(apiCustomer(2), 'jwt-2');
  docListeners.get('visibilitychange')(); // tab masih tersembunyi → belum disinkronkan
  assert.equal(useAuthStore.getState().token, 'jwt-1');
  doc.visibilityState = 'visible';
  docListeners.get('visibilitychange')();
  assert.equal(useAuthStore.getState().token, 'jwt-2');

  stop();
  assert.equal(winListeners.size, 0);
  assert.equal(docListeners.size, 0);
});

// ── #9 Hidrasi gagal / versi berbeda ──────────────────────────────────────────────────────────────────────────────

test('#9: versi persist berbeda (hidrasi tidak menerapkan apa pun) → nilai kanonis tetap diterapkan, tab konvergen', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  const originalError = console.error;
  console.error = () => {}; // Zustand mencatat "couldn't be migrated" untuk versi berbeda
  try {
    otherTabWrites(apiCustomer(2), 'jwt-2', 99);
    assert.equal(syncSessionFromStorage().changed, true);
  } finally {
    console.error = originalError;
  }
  assert.equal(useAuthStore.getState().token, 'jwt-2');
  assert.equal(useAuthStore.getState().user.userId, '2');
  assert.equal(syncSessionFromStorage().changed, false); // tidak berputar
});

test('#9: isi kanonis rusak (bukan JSON) → diperlakukan sebagai keluar, tanpa error', () => {
  useAuthStore.getState().setAuth(apiCustomer(1), 'jwt-1');
  store.set(AUTH_PERSIST_KEY, '{rusak');
  syncSessionFromStorage();
  assert.equal(useAuthStore.getState().token, null);
});

// ── #10 Pembersihan ───────────────────────────────────────────────────────────────────────────────────────────────

test('#10: syncSessionFromStorage hanya mengembalikan { changed, sessionChanged } (tanpa field mati)', () => {
  // sessionChanged ditambahkan untuk temuan M1 review db7d58d (profil ≠ pergantian sesi)
  assert.deepEqual(syncSessionFromStorage(), { changed: false, sessionChanged: false });
});
