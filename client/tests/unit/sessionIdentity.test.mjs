// Uji sesi antar-tab & identitas request — Step 6.3 (perbaikan arsitektur: satu sumber token = useAuthStore,
// sesi kanonis = persist "ovenco_auth", sinkron lewat event `storage`).
// SIMULASI: proses Node ini = "tab ini"; "tab lain" ditiru dengan menulis sesi kanonis di localStorage persis seperti
// persist Zustand tab lain, lalu (bila relevan) mengirim event `storage`. Ini BUKAN bukti multi-tab di browser nyata.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const writes = [];
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { writes.push(key); store.set(key, String(value)); },
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};

const calls = [];

/** fetch palsu berurutan; setiap langkah boleh menjalankan efek (tab lain login/logout) sebelum menjawab */
function scriptFetch(steps) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`fetch tak terduga ke ${url}`);
    step.before?.();
    if (step.gate) await step.gate;
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body };
  };
}

/** Target event `storage` palsu (pengganti window) */
const listeners = new Set();
const fakeWindow = {
  addEventListener: (type, fn) => type === 'storage' && listeners.add(fn),
  removeEventListener: (type, fn) => type === 'storage' && listeners.delete(fn),
};

const { apiClient } = await import('../../src/services/apiClient.js');
const { startSessionSync, syncSessionFromStorage } = await import('../../src/services/sessionSync.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const {
  CLIENT_ERROR_CODE, API_ERROR_CODE, SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE,
} = await import('../../src/constants/apiErrors.js');
const { AUTH_PERSIST_KEY, AUTH_TOKEN_STORAGE_KEY } = await import('../../src/constants/auth.js');

const SESSION_INVALID = {
  status: 401,
  body: { status: 'error', code: API_ERROR_CODE.SESSION_INVALID, message: 'Token tidak valid atau kedaluwarsa.' },
};
const EXPIRED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_EXPIRED, message: SESSION_EXPIRED_MESSAGE };
const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };

const customer = (id) => ({ user_id: id, role: 'customer' });
const authOf = (index) => calls[index].init.headers.Authorization;

/** Tab lain menulis sesi kanonis seperti persist Zustand miliknya */
function otherTabWrites(user, token) {
  store.set(AUTH_PERSIST_KEY, JSON.stringify({ state: { user, token }, version: 0 }));
  if (token) store.set(AUTH_TOKEN_STORAGE_KEY, token);
  else store.delete(AUTH_TOKEN_STORAGE_KEY);
}
const otherTabLogin = (id, token) => () => otherTabWrites(customer(id), token);
const otherTabLogout = () => otherTabWrites(null, null);
/** Browser mengirim event `storage` ke tab ini setelah tab lain menulis */
const deliverStorageEvent = (key = AUTH_PERSIST_KEY) => listeners.forEach((fn) => fn({ key }));
/** Tab ini sendiri masuk (lewat aksi store yang dipakai halaman Masuk) */
function thisTabLogin(id, token) {
  useAuthStore.getState().setAuth(customer(id), token);
  useCartStore.getState().loadUserCart(id);
}

let stopSync = () => {};

test.beforeEach(() => {
  stopSync();
  store.clear();
  writes.length = 0;
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
  stopSync = startSessionSync({ win: fakeWindow, doc: null });
});

test.after(() => stopSync());

// ── F1, F7: request tidak pernah memakai identitas tab lain ───────────────────────────────────────────────────────

test('F1: tab A = pelanggan A, tab B masuk sebagai B → request tab A TIDAK dikirim dengan token B (event belum diproses)', async () => {
  thisTabLogin('1', 'jwt-A');
  otherTabLogin('2', 'jwt-B')(); // sesi kanonis sudah B, event storage belum sampai
  scriptFetch([]);

  await assert.rejects(apiClient('/orders'), CHANGED);
  assert.equal(calls.length, 0); // request yang disusun untuk A tidak dikirim sama sekali
  // Tab ini kini mengikuti sesi kanonis (B) beserta keranjangnya
  assert.equal(useAuthStore.getState().token, 'jwt-B');
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
});

test('F7: salinan ovenco_auth_token yang tidak sesuai tidak menentukan identitas; store tetap sumber token', async () => {
  thisTabLogin('1', 'jwt-A');
  store.set(AUTH_TOKEN_STORAGE_KEY, 'jwt-B'); // salinan tulis-saja dirusak
  scriptFetch([{ status: 200, body: { data: 'ok' } }]);

  assert.equal(await apiClient('/me/profile'), 'ok');
  assert.equal(authOf(0), 'Bearer jwt-A');
});

test('F7: store tab ini tidak sesuai sesi kanonis yang dihapus (kunci dihapus) → request tidak dikirim atas nama lama', async () => {
  thisTabLogin('1', 'jwt-A');
  store.delete(AUTH_PERSIST_KEY); // mis. localStorage.clear() di tab lain
  scriptFetch([]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 0);
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, false); // logout tab lain bukan "kedaluwarsa"
});

// ── F2, F3: sinkronisasi lewat event storage ──────────────────────────────────────────────────────────────────────

test('F2: logout di tab B disinkronkan ke tab A (store kosong, keranjang tamu, keranjang akun tidak dihapus)', () => {
  thisTabLogin('1', 'jwt-A');
  useCartStore.getState().addItem({ product_id: 1, quantity: 2, name: 'Croissant', price: 28000 });
  const cartA = store.get('ovenco_mock_cart_1');

  otherTabLogout();
  deliverStorageEvent();

  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().sessionExpired, false);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.equal(store.get('ovenco_mock_cart_1'), cartA);
});

test('F3: pengguna baru masuk di tab B → sesi & keranjang tab A ikut berganti; tidak ada loop tulis storage', () => {
  thisTabLogin('1', 'jwt-A');
  store.set('ovenco_mock_cart_2', JSON.stringify([{ cart_item_id: 5, product_id: 7, quantity: 1 }]));
  writes.length = 0;

  otherTabLogin('2', 'jwt-B')();
  deliverStorageEvent();

  assert.equal(useAuthStore.getState().token, 'jwt-B');
  assert.equal(useAuthStore.getState().user.user_id, '2');
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
  assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id), [7]);
  // Hidrasi ulang tidak menulis balik sesi kanonis (tidak memicu event di tab lain lagi)
  assert.equal(writes.filter((key) => key === AUTH_PERSIST_KEY).length, 0);

  // Event berulang dengan isi sama tidak mengubah apa pun
  deliverStorageEvent();
  assert.equal(syncSessionFromStorage().changed, false);
});

test('F3: event storage untuk key lain diabaikan; localStorage.clear() (key null) mengeluarkan tab ini', () => {
  thisTabLogin('1', 'jwt-A');
  deliverStorageEvent('ovenco_mock_cart_9');
  assert.equal(useAuthStore.getState().token, 'jwt-A');

  store.clear();
  deliverStorageEvent(null);
  assert.equal(useAuthStore.getState().token, null);
});

// ── F4, F5, F6, F8: respons terlambat dari identitas lama ─────────────────────────────────────────────────────────

test('F4: respons GET milik A yang terlambat TIDAK dikembalikan ke sesi B', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([{
    before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); },
    status: 200, body: { data: [{ order_number: 'OVC-PELANGGAN-A' }] },
  }]);

  await assert.rejects(apiClient('/orders'), CHANGED);
  assert.equal(useAuthStore.getState().token, 'jwt-B');
});

test('F4: respons GET terlambat juga dibuang bila tab lain logout (data akun tidak tampil di konteks tamu)', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([{ before: otherTabLogout, status: 200, body: { data: { name: 'Anisa' } } }]); // tanpa event

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(useAuthStore.getState().token, null);
});

test('F4/L6: pengguna yang SAMA masuk lagi (token baru) → respons sesi lama TIDAK dipakai; GET diulang sekali di sesi baru', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([
    { before: () => thisTabLogin('1', 'jwt-A-baru'), status: 200, body: { data: { name: 'Anisa (sesi lama)' } } },
    { status: 200, body: { data: { name: 'Anisa' } } },
  ]);

  assert.deepEqual(await apiClient('/me/profile'), { name: 'Anisa' });
  assert.equal(calls.length, 2);
  assert.equal(authOf(1), 'Bearer jwt-A-baru');
});

test('F5: respons 401 milik A tidak menghapus sesi B; GET tidak diulang dengan token B', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([{ before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); }, ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, 'jwt-B');
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('F5: GET 401 setelah pelanggan A sendiri masuk lagi → diulang SEKALI dengan token baru A dan berhasil', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([
    { before: () => thisTabLogin('1', 'jwt-A-baru'), ...SESSION_INVALID },
    { status: 200, body: { data: { name: 'Anisa' } } },
  ]);

  assert.deepEqual(await apiClient('/me/profile'), { name: 'Anisa' });
  assert.equal(authOf(1), 'Bearer jwt-A-baru');
});

test('F5: identitas dibandingkan sebagai string (mock user_id angka = API userId string); tanpa user_id → tidak diulang', async () => {
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'jwt-A');
  scriptFetch([
    { before: () => useAuthStore.getState().setAuth({ userId: '1', role: 'customer' }, 'jwt-A-baru'), ...SESSION_INVALID },
    { status: 200, body: { data: 'ok' } },
  ]);
  assert.equal(await apiClient('/me/profile'), 'ok');

  calls.length = 0;
  useAuthStore.getState().setAuth({ role: 'customer' }, 'jwt-X');
  scriptFetch([{ before: () => useAuthStore.getState().setAuth({ role: 'customer' }, 'jwt-Y'), ...SESSION_INVALID }]);
  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
});

test('F5/F9: ulangan dengan token baru A juga 401 → sekali saja, sesi baru (masih aktif) dihapus dengan notifikasi', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([{ before: () => thisTabLogin('1', 'jwt-A-baru'), ...SESSION_INVALID }, { ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), EXPIRED);
  assert.equal(calls.length, 2);
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

test('F5: ulangan 401 tetapi pengguna B masuk di tab lain selama ulangan → sesi B tidak dihapus', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([
    { before: () => thisTabLogin('1', 'jwt-A-baru'), ...SESSION_INVALID },
    { before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); }, ...SESSION_INVALID },
  ]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(useAuthStore.getState().token, 'jwt-B');
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('F6: POST /custom-cake-designs (foto) milik A — 401 atau 201 setelah B masuk → tidak diulang dengan token B, hasil A tidak masuk sesi B', async () => {
  for (const response of [SESSION_INVALID, { status: 201, body: { data: { design_id: '1000001', design_token: null } } }]) {
    calls.length = 0;
    thisTabLogin('1', 'jwt-A');
    const form = new FormData();
    form.append('design', '{}');
    form.append('referencePhoto', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'a.jpg');
    scriptFetch([{ before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); }, ...response }]);

    await assert.rejects(apiClient('/custom-cake-designs', { method: 'POST', body: form, guestFallback: true }), CHANGED);
    assert.equal(calls.length, 1);
    assert.ok(!calls.some((c) => c.init.headers.Authorization === 'Bearer jwt-B'));
    assert.equal(useAuthStore.getState().token, 'jwt-B');
  }
});

test('F6: POST/PUT/PATCH/DELETE tidak pernah diulang dengan token pengganti, walau pengguna sama', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    calls.length = 0;
    thisTabLogin('1', 'jwt-A');
    scriptFetch([{ before: () => thisTabLogin('1', 'jwt-A-baru'), ...SESSION_INVALID }]);
    await assert.rejects(apiClient('/me/addresses', { method, body: {}, guestFallback: true }), CHANGED);
    assert.equal(calls.length, 1, method);
    assert.equal(useAuthStore.getState().token, 'jwt-A-baru', method);
  }
});

test('F6: fallback tamu tidak dipakai bila sesi sudah dihapus oleh tab/request LAIN (identitas awal berubah)', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([{ before: otherTabLogout, ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/custom-cake-designs', { method: 'POST', body: {}, guestFallback: true }), EXPIRED);
  assert.equal(calls.length, 1);
});

test('F6: pengguna lain masuk saat fallback tamu berjalan → hasil tamu tidak dikembalikan ke sesi barunya', async () => {
  thisTabLogin('1', 'jwt-A');
  scriptFetch([
    { ...SESSION_INVALID },
    { before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); }, status: 201, body: { data: { design_id: '9' } } },
  ]);

  await assert.rejects(apiClient('/custom-cake-designs', { method: 'POST', body: {}, guestFallback: true }), CHANGED);
  assert.equal(authOf(1), undefined);
  assert.equal(useAuthStore.getState().token, 'jwt-B');
});

test('F8: keranjang pelanggan B tidak dihapus, ditimpa, atau dikirim atas nama A oleh request keranjang A yang terlambat', async () => {
  thisTabLogin('1', 'jwt-A');
  useCartStore.getState().addItem({ product_id: 1, quantity: 3, name: 'Croissant', price: 28000 });
  const itemsA = useCartStore.getState().items;
  const cartB = JSON.stringify([{ cart_item_id: 5, product_id: 7, quantity: 2 }]);
  store.set('ovenco_mock_cart_2', cartB);

  for (const response of [SESSION_INVALID, { status: 200, body: { data: { lines: itemsA } } }]) {
    calls.length = 0;
    thisTabLogin('1', 'jwt-A');
    scriptFetch([{ before: () => { otherTabLogin('2', 'jwt-B')(); deliverStorageEvent(); }, ...response }]);

    await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: itemsA } }), CHANGED);
    assert.equal(calls.length, 1);
    assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2');
    assert.deepEqual(useCartStore.getState().items.map((i) => i.product_id), [7]);
    assert.equal(store.get('ovenco_mock_cart_2'), cartB);
  }
});

// ── F9: kedaluwarsa, notifikasi tunggal, kode terstruktur ─────────────────────────────────────────────────────────

test('F9: request bersamaan dengan token kedaluwarsa → semua pesan & kode EXPIRED, notifikasi SEKALI, tanpa ulangan', async () => {
  thisTabLogin('1', 'jwt-A');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let notices = 0;
  const unsubscribe = useAuthStore.subscribe((s, p) => { if (s.sessionExpired && !p.sessionExpired) notices += 1; });
  scriptFetch([{ gate, ...SESSION_INVALID }, { gate, ...SESSION_INVALID }, { gate, ...SESSION_INVALID }]);

  const requests = [apiClient('/me/profile'), apiClient('/orders'), apiClient('/me/points')];
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const results = await Promise.allSettled(requests);
  unsubscribe();

  assert.equal(notices, 1);
  for (const { status, reason } of results) {
    assert.equal(status, 'rejected');
    assert.equal(reason.status, 401);
    assert.equal(reason.code, CLIENT_ERROR_CODE.SESSION_EXPIRED);
    assert.equal(reason.message, SESSION_EXPIRED_MESSAGE);
  }
  assert.equal(calls.length, 3);
});

test('F9: kode sesi buatan frontend stabil & tidak bentrok dengan kode server', () => {
  assert.deepEqual(CLIENT_ERROR_CODE, { SESSION_EXPIRED: 'CLIENT_SESSION_EXPIRED', SESSION_CHANGED: 'CLIENT_SESSION_CHANGED' });
  assert.ok(!Object.values(API_ERROR_CODE).some((code) => Object.values(CLIENT_ERROR_CODE).includes(code)));
});

// ── F10: alur login/logout & mode yang sudah ada ──────────────────────────────────────────────────────────────────

test('F10: setAuth/logout tetap bekerja; sesi bentuk API (userId string) memuat keranjang akun saat disinkronkan', () => {
  useAuthStore.getState().setAuth({ userId: '42', role: 'customer' }, 'jwt-api');
  assert.equal(useAuthStore.getState().isLoggedIn(), true);
  assert.equal(useAuthStore.getState().hasRole('customer'), true);

  otherTabWrites({ userId: '43', role: 'customer' }, 'jwt-api-2');
  deliverStorageEvent();
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_43');

  // Staf/owner tidak memakai keranjang akun → keranjang tamu
  otherTabWrites({ user_id: 2, role: 'staf' }, 'jwt-staf');
  deliverStorageEvent();
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');

  useAuthStore.getState().logout();
  assert.equal(useAuthStore.getState().isLoggedIn(), false);
});

test('F10: startSessionSync aman tanpa API browser (Node / SSR) dan bisa dilepas', () => {
  assert.equal(typeof startSessionSync({ win: null, doc: null }), 'function');
  const stop = startSessionSync({ win: fakeWindow, doc: null });
  stop();
  assert.ok(listeners.size >= 1); // pendengar dari beforeEach masih ada, yang baru sudah dilepas
});
