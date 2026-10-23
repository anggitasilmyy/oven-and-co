// Uji apiClient mode API — Step 6.3 · review 49a1214 M1 (sesi kedaluwarsa) & FormData (unggah foto)
// fetch & localStorage dipalsukan; tidak ada request jaringan.

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
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  const { status, body } = responses.shift();
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

const { apiClient } = await import('../../src/services/apiClient.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { default: useCartStore } = await import('../../src/stores/useCartStore.js');

function login() {
  useAuthStore.getState().setAuth({ user_id: '1', role: 'customer' }, 'jwt-lama');
  useCartStore.getState().loadUserCart('1');
}

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  responses = [];
  useAuthStore.setState({ user: null, token: null });
});

const SESSION_INVALID = { status: 401, body: { status: 'error', code: 'SESSION_INVALID', message: 'Token tidak valid atau kedaluwarsa.' } };

test('sesi kedaluwarsa pada endpoint tamu: sesi dihapus, request diulang sekali TANPA token', async () => {
  login();
  responses = [SESSION_INVALID, { status: 200, body: { status: 'success', data: { lines: [] } } }];

  const data = await apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true });

  assert.deepEqual(data, { lines: [] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-lama');
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(localStorage.getItem('ovenco_auth_token'), null);
  assert.equal(useCartStore.getState()._storageKey, 'ovenco_mock_cart_guest');
});

test('sesi kedaluwarsa pada endpoint khusus pelanggan: sesi dihapus, TIDAK diulang, pesan sesi berakhir', async () => {
  login();
  responses = [SESSION_INVALID];

  await assert.rejects(apiClient('/checkout/context'), { status: 401, message: /Sesi kamu sudah berakhir/ });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, null);
});

test('403 (peran tidak sesuai) TIDAK menghapus sesi', async () => {
  login();
  responses = [{ status: 403, body: { status: 'error', message: 'Anda tidak memiliki izin.' } }];

  await assert.rejects(apiClient('/cart', { method: 'POST', body: { items: [] }, allowGuest: true }), { status: 403 });
  assert.equal(calls.length, 1);
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
});

test('401 tanpa kode sesi (mis. sandi salah saat login) TIDAK menghapus sesi', async () => {
  login();
  responses = [{ status: 401, body: { status: 'error', message: 'Email atau kata sandi salah.' } }];

  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: {} }), { status: 401, message: /sandi salah/ });
  assert.equal(useAuthStore.getState().token, 'jwt-lama');
});

test('body FormData dikirim apa adanya tanpa Content-Type JSON (boundary diatur fetch)', async () => {
  responses = [{ status: 201, body: { status: 'success', data: { design_id: '1' } } }];
  const form = new FormData();
  form.append('design', '{}');

  await apiClient('/custom-cake-designs', { method: 'POST', body: form, allowGuest: true });

  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
});
