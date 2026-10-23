// Uji apiClient — re-review 6158dd0: #1 sinkronisasi sesi antar-tab, #2 request tidak berpindah identitas,
// #6 kode error sesi terstruktur. fetch & localStorage dipalsukan; tidak ada request jaringan / login nyata.

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

/** fetch palsu berurutan; setiap langkah boleh menjalankan efek (login ulang, tab lain) sebelum menjawab */
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

const { apiClient } = await import('../../src/services/apiClient.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const {
  CLIENT_ERROR_CODE, API_ERROR_CODE, SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE,
} = await import('../../src/constants/apiErrors.js');
const { AUTH_TOKEN_STORAGE_KEY } = await import('../../src/constants/auth.js');

const SESSION_INVALID = {
  status: 401,
  body: { status: 'error', code: API_ERROR_CODE.SESSION_INVALID, message: 'Token tidak valid atau kedaluwarsa.' },
};
const EXPIRED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_EXPIRED, message: SESSION_EXPIRED_MESSAGE };
const CHANGED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_CHANGED, message: SESSION_CHANGED_MESSAGE };

const authOf = (index) => calls[index].init.headers.Authorization;
const loginAs = (userId, token) => () => useAuthStore.getState().setAuth({ user_id: userId, role: 'customer' }, token);
/** Tab lain menghapus salinan token di localStorage; store Zustand tab ini tidak tersentuh */
const otherTabClearsToken = () => localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);

function loginCustomerA() {
  loginAs('1', 'jwt-A')();
  useCartStore.getState().loadUserCart('1');
}

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
});

// ── #1 Sesi antar-tab ─────────────────────────────────────────────────────────────────────────────────────────────

test('A-tab: store tab B masih memegang token lama, localStorage dikosongkan tab A saat request berjalan → sesi tab B dibersihkan', async () => {
  loginCustomerA();
  useCartStore.getState().addItem({ product_id: 1, quantity: 1, name: 'Croissant', price: 28000 });
  scriptFetch([{ before: otherTabClearsToken, ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), EXPIRED);
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.ok(localStorage.getItem('ovenco_mock_cart_1')); // keranjang akun tetap tersimpan untuk login berikutnya
});

test('A-tab: localStorage sudah kosong SEBELUM request dikirim → 401 biasa (tanpa kode) tetap membersihkan store basi', async () => {
  loginCustomerA();
  otherTabClearsToken();
  scriptFetch([{ status: 401, body: { status: 'error', message: 'Autentikasi diperlukan.' } }]);

  await assert.rejects(apiClient('/me/profile'), EXPIRED);
  assert.equal(authOf(0), undefined); // request memang terkirim tanpa token
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  assert.equal(calls.length, 1);
});

test('A-tab: store tab ini sudah memegang token BARU → token, sesi & keranjang baru tetap utuh', async () => {
  loginCustomerA();
  scriptFetch([{
    before: () => {
      loginAs('1', 'jwt-A-baru')(); // tab ini sudah masuk lagi
      otherTabClearsToken(); // lalu tab lain menghapus salinan localStorage
    },
    ...SESSION_INVALID,
  }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(useAuthStore.getState().token, 'jwt-A-baru');
  assert.equal(useAuthStore.getState().sessionExpired, false);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_1');
});

test('A-tab: request bersamaan di tab B setelah tab A menghapus token → notifikasi SEKALI, semua pesan ramah', async () => {
  loginCustomerA();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let notices = 0;
  const unsubscribe = useAuthStore.subscribe((s, p) => { if (s.sessionExpired && !p.sessionExpired) notices += 1; });
  scriptFetch([
    { gate, ...SESSION_INVALID },
    { gate, ...SESSION_INVALID },
    { gate, ...SESSION_INVALID },
  ]);

  const requests = [apiClient('/me/profile'), apiClient('/orders'), apiClient('/me/points')];
  await new Promise((resolve) => setImmediate(resolve));
  otherTabClearsToken();
  release();
  const results = await Promise.allSettled(requests);
  unsubscribe();

  assert.equal(notices, 1);
  for (const { status, reason } of results) {
    assert.equal(status, 'rejected');
    assert.equal(reason.code, CLIENT_ERROR_CODE.SESSION_EXPIRED);
    assert.equal(reason.message, SESSION_EXPIRED_MESSAGE);
  }
  assert.equal(calls.length, 3);
});

test('A-tab: endpoint tamu tetap fallback SEKALI tanpa token setelah sesi tab ini dibersihkan', async () => {
  loginCustomerA();
  scriptFetch([
    { before: otherTabClearsToken, ...SESSION_INVALID },
    { status: 200, body: { data: { lines: [] } } },
  ]);

  assert.deepEqual(await apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }), { lines: [] });
  assert.equal(calls.length, 2);
  assert.equal(authOf(1), undefined);
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

// ── #2 Request tidak berpindah identitas ──────────────────────────────────────────────────────────────────────────

test('B-1: GET pelanggan A menerima 401 setelah pelanggan B masuk → TIDAK diulang dengan token B', async () => {
  loginCustomerA();
  scriptFetch([{ before: loginAs('2', 'jwt-B'), ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((c) => c.init.headers.Authorization === 'Bearer jwt-B'));
  assert.equal(useAuthStore.getState().token, 'jwt-B');
});

test('B-2: GET pelanggan A menerima 401 setelah pelanggan A masuk lagi → diulang dengan token baru A dan berhasil', async () => {
  loginCustomerA();
  scriptFetch([
    { before: loginAs('1', 'jwt-A-baru'), ...SESSION_INVALID },
    { status: 200, body: { data: { name: 'Anisa' } } },
  ]);

  assert.deepEqual(await apiClient('/me/profile'), { name: 'Anisa' });
  assert.equal(calls.length, 2);
  assert.equal(authOf(1), 'Bearer jwt-A-baru');
});

test('B-2: identitas dibandingkan sebagai string (user_id angka di mock = userId string dari API)', async () => {
  useAuthStore.getState().setAuth({ user_id: 1, role: 'customer' }, 'jwt-A'); // bentuk mock (angka)
  scriptFetch([
    { before: () => useAuthStore.getState().setAuth({ userId: '1', role: 'customer' }, 'jwt-A-baru'), ...SESSION_INVALID },
    { status: 200, body: { data: 'ok' } },
  ]);

  assert.equal(await apiClient('/me/profile'), 'ok');
  assert.equal(calls.length, 2);
});

test('B-3: POST /custom-cake-designs (foto) menerima 401 setelah pelanggan B masuk → tidak ada ulangan dengan token B', async () => {
  loginCustomerA();
  const form = new FormData();
  form.append('design', '{}');
  form.append('referencePhoto', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'a.jpg');
  scriptFetch([{ before: loginAs('2', 'jwt-B'), ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/custom-cake-designs', { method: 'POST', body: form, allowGuest: true }), CHANGED);
  assert.equal(calls.length, 1); // desain & foto pelanggan A tidak pernah dikirim atas nama B
  assert.equal(useAuthStore.getState().token, 'jwt-B');
});

test('B-3: POST dengan token pengganti milik pelanggan yang SAMA juga tidak diulang (POST tidak pernah)', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    calls.length = 0;
    loginCustomerA();
    scriptFetch([{ before: loginAs('1', 'jwt-A-baru'), ...SESSION_INVALID }]);
    await assert.rejects(apiClient('/custom-cake-designs', { method, body: {}, allowGuest: true }), CHANGED);
    assert.equal(calls.length, 1, method);
  }
});

test('B-4: POST endpoint tamu setelah sesi lama benar-benar dihapus → fallback SEKALI tanpa token', async () => {
  loginCustomerA();
  scriptFetch([
    { ...SESSION_INVALID },
    { status: 201, body: { data: { design_id: '1000001', design_token: 'tok' } } },
  ]);

  const result = await apiClient('/custom-cake-designs', { method: 'POST', body: {}, allowGuest: true });
  assert.equal(result.design_id, '1000001');
  assert.equal(calls.length, 2);
  assert.equal(authOf(1), undefined);
  assert.equal(useAuthStore.getState().sessionExpired, true);
});

test('B-5: identitas awal tidak diketahui (store tab ini tamu, token milik tab lain) → tidak pernah diulang atas nama pengguna baru', async () => {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt-tab-lain');
  scriptFetch([{ before: () => localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt-B'), ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((c) => c.init.headers.Authorization === 'Bearer jwt-B'));
});

test('B-5: pengguna tanpa user_id di store → identitas tidak diketahui, GET tidak diulang', async () => {
  useAuthStore.getState().setAuth({ role: 'customer' }, 'jwt-A');
  scriptFetch([{ before: () => useAuthStore.getState().setAuth({ role: 'customer' }, 'jwt-A-baru'), ...SESSION_INVALID }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
});

test('B-5: token baru tidak lagi aktif (store & localStorage tidak sepakat) → GET tidak diulang', async () => {
  loginCustomerA();
  scriptFetch([{
    before: () => {
      loginAs('1', 'jwt-A-baru')();
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt-tab-lain'); // tab lain menimpa token sesudahnya
    },
    ...SESSION_INVALID,
  }]);

  await assert.rejects(apiClient('/me/profile'), CHANGED);
  assert.equal(calls.length, 1);
});

test('B-6: token & keranjang pelanggan B tidak pernah dihapus/diganti oleh respons terlambat milik pelanggan A', async () => {
  const cases = [
    { path: '/me/profile', options: {} },
    { path: '/me/addresses', options: { method: 'POST', body: {} } },
    { path: '/cart', options: { method: 'POST', body: { items: [] }, allowGuest: true } },
    { path: '/custom-cake-designs', options: { method: 'POST', body: {}, allowGuest: true } },
  ];

  for (const { path, options } of cases) {
    calls.length = 0;
    loginCustomerA();
    scriptFetch([{
      before: () => {
        loginAs('2', 'jwt-B')();
        useCartStore.getState().loadUserCart('2');
        useCartStore.getState().addItem({ product_id: 7, quantity: 1, name: 'Roti', price: 15000 });
      },
      ...SESSION_INVALID,
    }]);

    await apiClient(path, options).catch(() => {});
    assert.equal(useAuthStore.getState().token, 'jwt-B', path);
    assert.equal(useAuthStore.getState().user.user_id, '2', path);
    assert.equal(useAuthStore.getState().sessionExpired, false, path);
    assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_2', path);
    assert.equal(useCartStore.getState().items.length, 1, path);
    assert.equal(calls.length, 1, path);
    localStorage.removeItem('ovenco_mock_cart_2');
  }
});

// ── #6 Kode error terstruktur ─────────────────────────────────────────────────────────────────────────────────────

test('#6: kode error sesi stabil, tidak memakai kode server, dan sepasang dengan pesan & status', async () => {
  assert.deepEqual(CLIENT_ERROR_CODE, { SESSION_EXPIRED: 'CLIENT_SESSION_EXPIRED', SESSION_CHANGED: 'CLIENT_SESSION_CHANGED' });
  assert.ok(!Object.values(API_ERROR_CODE).some((code) => Object.values(CLIENT_ERROR_CODE).includes(code)));

  loginCustomerA();
  scriptFetch([{ ...SESSION_INVALID }]);
  await assert.rejects(apiClient('/me/profile'), EXPIRED);

  loginCustomerA();
  scriptFetch([{ before: loginAs('2', 'jwt-B'), ...SESSION_INVALID }]);
  await assert.rejects(apiClient('/me/addresses', { method: 'POST', body: {} }), CHANGED);

  // Error biasa dari server tetap membawa kode server apa adanya
  scriptFetch([{ status: 400, body: { status: 'error', code: API_ERROR_CODE.INVALID_ID, message: 'ID produk tidak valid.' } }]);
  await assert.rejects(apiClient('/products/abc'), { status: 400, code: API_ERROR_CODE.INVALID_ID });
});
