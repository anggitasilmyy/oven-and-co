// Uji apiClient mode API — Step 6.3: sesi kedaluwarsa satu tab, FormData, kode error, 403/401 biasa.
// Skenario antar-tab & pergantian identitas ada di sessionIdentity.test.mjs.
// fetch & localStorage dipalsukan; tidak ada request jaringan / login nyata.

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
let responses = [];
const defaultFetch = async (url, init) => {
  calls.push({ url, init });
  const { status, body } = responses.shift();
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};
globalThis.fetch = defaultFetch;

const { apiClient } = await import('../../src/services/apiClient.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');
const {
  API_ERROR_CODE, CLIENT_ERROR_CODE, SESSION_EXPIRED_MESSAGE, SESSION_EXPIRED_NOTICE,
} = await import('../../src/constants/apiErrors.js');
const { AUTH_TOKEN_STORAGE_KEY, AUTH_PERSIST_KEY } = await import('../../src/constants/auth.js');

const SESSION_INVALID = {
  status: 401,
  body: { status: 'error', code: API_ERROR_CODE.SESSION_INVALID, message: 'Token tidak valid atau kedaluwarsa.' },
};
const EXPIRED = { status: 401, code: CLIENT_ERROR_CODE.SESSION_EXPIRED, message: SESSION_EXPIRED_MESSAGE };

function login() {
  useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-lama');
  useCartStore.getState().loadUserCart('1');
}

test.beforeEach(() => {
  globalThis.fetch = defaultFetch;
  store.clear();
  calls.length = 0;
  responses = [];
  useAuthStore.setState({ user: null, token: null, sessionExpired: false });
  useCartStore.getState().resetToGuest();
});

test('token request diambil dari useAuthStore; salinan ovenco_auth_token TIDAK menentukan identitas', async () => {
  login();
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'jwt-pengguna-lain'); // salinan lama dirusak / ditimpa
  responses = [{ status: 200, body: { data: 'ok' } }];

  await apiClient('/me/profile');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-lama');
});

test('setAuth & logout menulis sesi kanonis (persist) lalu salinan kompatibilitas dengan key yang sama seperti dulu', () => {
  assert.equal(AUTH_PERSIST_KEY, 'ovenco_auth');
  assert.equal(AUTH_TOKEN_STORAGE_KEY, 'ovenco_auth_token');

  login();
  assert.deepEqual(JSON.parse(localStorage.getItem(AUTH_PERSIST_KEY)).state, { user: { user_id: '1', role: 'customer' }, token: 'jwt-lama' });
  assert.equal(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY), 'jwt-lama');

  useAuthStore.getState().logout();
  assert.deepEqual(JSON.parse(localStorage.getItem(AUTH_PERSIST_KEY)).state, { user: null, token: null });
  assert.equal(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY), null);
});

test('sesi kedaluwarsa pada endpoint akun: sesi dihapus, TIDAK diulang, pesan & kode terstruktur, notifikasi', async () => {
  login();
  responses = [SESSION_INVALID];

  await assert.rejects(apiClient('/checkout/context'), EXPIRED);
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
});

test('keranjang (POST /cart) TIDAK memakai fallback tamu: body keranjang akun tidak dikirim ulang sebagai tamu', async () => {
  login();
  useCartStore.getState().addItem({ product_id: 1, quantity: 3, name: 'Croissant', price: 28000 });
  const accountCart = localStorage.getItem('ovenco_mock_cart_1');
  responses = [SESSION_INVALID];

  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: useCartStore.getState().items } }), EXPIRED);
  assert.equal(calls.length, 1);
  // Store pindah ke keranjang tamu; keranjang akun tetap utuh di perangkat untuk login berikutnya
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
  assert.equal(localStorage.getItem('ovenco_mock_cart_1'), accountCart);
});

test('operasi ber-guestFallback (desain custom cake): diulang SEKALI tanpa token; ulangan tidak pernah lebih dari satu', async () => {
  login();
  responses = [SESSION_INVALID, { status: 201, body: { data: { design_id: '1000001' } } }];

  assert.deepEqual(await apiClient('/custom-cake-designs', { method: 'POST', body: {}, guestFallback: true }), { design_id: '1000001' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Authorization, undefined);

  // Fallback tamu yang gagal tidak diulang lagi
  calls.length = 0;
  login();
  responses = [SESSION_INVALID, { status: 500, body: { message: 'Terjadi kesalahan pada server.' } }];
  await assert.rejects(apiClient('/custom-cake-designs', { method: 'POST', body: {}, guestFallback: true }), { status: 500 });
  assert.equal(calls.length, 2);
});

test('notifikasi sesi berakhir netral, bisa ditutup, dan tidak muncul lagi tanpa kedaluwarsa baru', async () => {
  assert.equal(SESSION_EXPIRED_NOTICE, 'Sesi Anda telah berakhir. Silakan masuk kembali untuk menggunakan fitur akun.');
  useAuthStore.getState().setAuth({ user_id: '3', role: 'owner' }, 'jwt-owner');
  responses = [SESSION_INVALID];
  await assert.rejects(apiClient('/admin/orders'), EXPIRED);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  useAuthStore.getState().dismissSessionNotice();

  responses = [
    { status: 200, body: { data: [] } },
    { status: 403, body: { message: 'Akses ditolak' } },
    { status: 401, body: { message: 'Email atau kata sandi salah.' } },
  ];
  await apiClient('/products');
  await assert.rejects(apiClient('/admin/orders'), { status: 403 });
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: {} }), { status: 401, message: /sandi salah/ });
  assert.equal(useAuthStore.getState().sessionExpired, false);

  // Login berikutnya juga membersihkan tanda
  useAuthStore.setState({ sessionExpired: true });
  login();
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('403 (peran tidak sesuai) dan 401 tanpa kode sesi TIDAK menghapus sesi', async () => {
  login();
  responses = [
    { status: 403, body: { status: 'error', message: 'Anda tidak memiliki izin.' } },
    { status: 401, body: { status: 'error', message: 'Email atau kata sandi salah.' } },
  ];

  await assert.rejects(apiClient('/admin/orders'), { status: 403 });
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: {} }), { status: 401, message: /sandi salah/ });
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
  assert.equal(calls.length, 2);
});

test('tanpa sesi: 401 SESSION_INVALID tidak memicu penghapusan sesi / notifikasi / ulangan', async () => {
  responses = [SESSION_INVALID];
  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: [] } }), { status: 401 });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('error 400 membawa kode aplikasi (INVALID_ID) dari body respons', async () => {
  responses = [{ status: 400, body: { status: 'error', code: API_ERROR_CODE.INVALID_ID, message: 'ID produk tidak valid.' } }];
  await assert.rejects(apiClient('/products/abc'), { status: 400, code: API_ERROR_CODE.INVALID_ID });
});

test('body FormData dikirim apa adanya tanpa Content-Type JSON (boundary diatur fetch)', async () => {
  responses = [{ status: 201, body: { status: 'success', data: { design_id: '1' } } }];
  const form = new FormData();
  form.append('design', '{}');

  await apiClient('/custom-cake-designs', { method: 'POST', body: form, guestFallback: true });

  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
});
