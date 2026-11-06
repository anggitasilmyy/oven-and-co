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

// ── Step 6.6 (CP1) · G3 fieldErrors & G4 gangguan jaringan / respons tak terbaca ─────────────────────────────────

const {
  CLIENT_REQUEST_ERROR_CODE, NETWORK_ERROR_STATUS, NETWORK_ERROR_MESSAGE, INVALID_RESPONSE_MESSAGE,
} = await import('../../src/constants/apiErrors.js');
const { createApiError, isNetworkError, isSessionError, isAbortError } = await import('../../src/utils/apiErrors.js');
const { saveProduct } = await import('../../src/services/adminProductService.js');

const PRODUCT_FIELD_ERRORS = { name: 'Nama produk wajib diisi.', price: 'Harga harus lebih dari 0.', 'variants[0]': 'Nama varian wajib diisi.' };

test('CP1 #1: 400 dari server meneruskan message, status, code, dan fieldErrors apa adanya', async () => {
  responses = [{ status: 400, body: { status: 'error', message: 'Nama produk wajib diisi.', fieldErrors: PRODUCT_FIELD_ERRORS } }];
  const error = await apiClient('/admin/products', { method: 'POST', body: {} }).catch((e) => e);
  assert.equal(error.status, 400);
  assert.equal(error.message, 'Nama produk wajib diisi.');
  assert.deepEqual(error.fieldErrors, PRODUCT_FIELD_ERRORS);
  assert.equal(error.code, undefined);
});

test('CP1 #2: pemanggil (service form AD-06) membaca error per field dari err.fieldErrors', async () => {
  useAuthStore.getState().setAuth({ userId: '2', role: 'staf' }, 'jwt-staf');
  responses = [{ status: 400, body: { status: 'error', message: 'Harga harus lebih dari 0.', fieldErrors: { price: 'Harga harus lebih dari 0.' } } }];
  // Pola sama dengan hooks/useProductForm: setServerErrors(err.fieldErrors ?? {})
  const error = await saveProduct(7, { name: 'Croissant', price: '0' }).catch((e) => e);
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-staf');
  assert.deepEqual(error.fieldErrors ?? {}, { price: 'Harga harus lebih dari 0.' });
});

test('CP1: error tanpa fieldErrors / fieldErrors bukan objek → tidak ada properti fieldErrors (form memakai ?? {})', async () => {
  responses = [
    { status: 400, body: { status: 'error', message: 'Format data JSON tidak valid.' } },
    { status: 400, body: { status: 'error', message: 'x', fieldErrors: ['bukan', 'peta'] } },
  ];
  assert.equal((await apiClient('/admin/products', { method: 'POST', body: {} }).catch((e) => e)).fieldErrors, undefined);
  assert.equal((await apiClient('/admin/products', { method: 'POST', body: {} }).catch((e) => e)).fieldErrors, undefined);
  // createApiError tetap kompatibel dengan pemanggil lama (3 argumen)
  const legacy = createApiError('pesan', 404, 'KODE');
  assert.deepEqual([legacy.message, legacy.status, legacy.code, legacy.fieldErrors], ['pesan', 404, 'KODE', undefined]);
});

test('CP1 #3 & #4: server mati / koneksi ditolak / CORS → pesan Indonesia, status 0, kode jaringan, penyebab asli di cause', async () => {
  login();
  const original = new TypeError('Failed to fetch');
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); throw original; };

  const error = await apiClient('/me/points').catch((e) => e);
  assert.equal(error.message, NETWORK_ERROR_MESSAGE);
  assert.equal(error.message, 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan coba kembali.');
  assert.doesNotMatch(error.message, /Failed to fetch|TypeError/);
  assert.equal(error.status, NETWORK_ERROR_STATUS);
  assert.equal(error.status, 0);
  assert.equal(error.code, CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR);
  assert.equal(error.cause, original);
  assert.equal(isNetworkError(error), true);
  // Bukan error sesi: data yang tampil tidak dibuang (useServiceQuery), sesi & keranjang akun tetap
  assert.equal(isSessionError(error), false);
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
  assert.equal(useAuthStore.getState().sessionExpired, false);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_1');
  // Mutasi juga tidak dikirim ulang otomatis
  calls.length = 0;
  await assert.rejects(apiClient('/orders', { method: 'POST', body: {} }), { code: CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR });
  assert.equal(calls.length, 1);
});

test('CP1: AbortError (request dibatalkan pemanggil) diteruskan apa adanya, TIDAK diklasifikasi sebagai error jaringan', async () => {
  const abort = new DOMException('The operation was aborted.', 'AbortError');
  globalThis.fetch = async () => { throw abort; };
  const error = await apiClient('/products').catch((e) => e);
  assert.equal(error, abort);
  assert.equal(isAbortError(error), true);
  assert.equal(isNetworkError(error), false);
});

test('CP1 #5: respons non-JSON (mis. HTML 502 proxy) → pesan Indonesia, status HTTP asli, kode respons tak terbaca', async () => {
  globalThis.fetch = async () => ({
    ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
  });
  const error = await apiClient('/products').catch((e) => e);
  assert.equal(error.message, INVALID_RESPONSE_MESSAGE);
  assert.doesNotMatch(error.message, /Unexpected token|SyntaxError/);
  assert.equal(error.status, 502);
  assert.equal(error.code, CLIENT_REQUEST_ERROR_CODE.INVALID_RESPONSE);
});

test('CP1 #5: 2xx dengan body tak terbaca / JSON bukan objek tidak dianggap sukses kosong', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } });
  await assert.rejects(apiClient('/products'), { status: 200, code: CLIENT_REQUEST_ERROR_CODE.INVALID_RESPONSE, message: INVALID_RESPONSE_MESSAGE });
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => null });
  await assert.rejects(apiClient('/products'), { status: 500, code: CLIENT_REQUEST_ERROR_CODE.INVALID_RESPONSE });
});

test('CP1 #6: 401 SESSION_INVALID tetap memicu mekanisme sesi (hapus sesi, notifikasi) — tanpa fieldErrors', async () => {
  login();
  responses = [SESSION_INVALID];
  const error = await apiClient('/me/points').catch((e) => e);
  assert.equal(error.status, 401);
  assert.equal(error.code, CLIENT_ERROR_CODE.SESSION_EXPIRED);
  assert.equal(error.message, SESSION_EXPIRED_MESSAGE);
  assert.equal(useAuthStore.getState().token, null);
  assert.equal(useAuthStore.getState().sessionExpired, true);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
});

test('CP1 #7 & #8: 403 & 404 tidak berubah; 409 mempertahankan pesan, kode, dan fieldErrors backend', async () => {
  login();
  responses = [
    { status: 403, body: { status: 'error', message: 'Anda tidak memiliki izin.' } },
    { status: 404, body: { status: 'error', message: 'Produk tidak ditemukan.' } },
    { status: 409, body: { status: 'error', message: 'Stok sudah berubah. Muat ulang data.', fieldErrors: { stock: 'Stok sudah berubah.' } } },
  ];
  await assert.rejects(apiClient('/admin/orders'), (e) => e.status === 403 && e.message === 'Anda tidak memiliki izin.' && e.fieldErrors === undefined);
  await assert.rejects(apiClient('/admin/products/999'), { status: 404, message: 'Produk tidak ditemukan.' });
  const conflict = await apiClient('/admin/raw-materials/1', { method: 'PUT', body: {} }).catch((e) => e);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.message, 'Stok sudah berubah. Muat ulang data.');
  assert.deepEqual(conflict.fieldErrors, { stock: 'Stok sudah berubah.' });
  // 403/404/409 tidak menyentuh sesi
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
  assert.equal(useAuthStore.getState().sessionExpired, false);
});

test('CP1 #9: FormData tetap terkirim apa adanya bersama Authorization; error 400 multipart membawa fieldErrors', async () => {
  login();
  responses = [{ status: 400, body: { status: 'error', message: 'Maksimal 5 foto.', fieldErrors: { photos: 'Maksimal 5 foto.' } } }];
  const form = new FormData();
  form.append('product', '{}');
  const error = await apiClient('/admin/products', { method: 'POST', body: form }).catch((e) => e);
  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-lama');
  assert.deepEqual(error.fieldErrors, { photos: 'Maksimal 5 foto.' });
});
