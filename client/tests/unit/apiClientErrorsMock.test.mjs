// Uji mode mock — Step 6.6 (CP1) · G3/G4: perubahan penanganan error mode API tidak mengubah mode mock.
// Jalur asli apiClient (USE_MOCK = true) → runMockRequest → mockHandler; fetch tidak pernah dipanggil.
// Mode mock diaktifkan tests/unit/mock-env-loader.mjs.

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
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new TypeError('Failed to fetch'); };

const { apiClient, USE_MOCK } = await import('../../src/services/apiClient.js');
const { saveProduct } = await import('../../src/services/adminProductService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');
const { CLIENT_REQUEST_ERROR_CODE } = await import('../../src/constants/apiErrors.js');

test.beforeEach(() => {
  store.clear();
  fetchCalls = 0;
  useAuthStore.setState({ user: { user_id: 2, role: 'staf' }, token: 'mock_token_2', sessionExpired: false });
});

test('mode mock aktif dan fetch tidak dipanggil (gangguan jaringan tidak relevan di mode mock)', async () => {
  assert.equal(USE_MOCK, true);
  assert.deepEqual(await apiClient('/apa-saja', { mockHandler: () => ({ ok: true }) }), { ok: true });
  assert.equal(fetchCalls, 0);
});

test('error mock dengan fieldErrors diteruskan objek yang sama (form AD-06 tidak berubah)', async () => {
  const error = await saveProduct(null, { name: '', category_id: '', price: '', availability_type: 'ready', variants: [], photos: [] })
    .catch((e) => e);
  assert.ok(error instanceof Error);
  assert.equal(typeof error.fieldErrors, 'object');
  assert.ok(error.fieldErrors.name, JSON.stringify(error.fieldErrors));
  assert.equal(error.code, undefined);
  assert.equal(fetchCalls, 0);
});

test('error mock biasa tetap pesan apa adanya, tanpa status/kode jaringan', async () => {
  const error = await apiClient('/x', { mockHandler: () => { throw new Error('Pesanan tidak ditemukan'); } }).catch((e) => e);
  assert.equal(error.message, 'Pesanan tidak ditemukan');
  assert.notEqual(error.code, CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR);
  assert.equal(error.status, undefined);
});

test('tanpa mockHandler tetap error pemrograman yang sama seperti sebelumnya', async () => {
  await assert.rejects(apiClient('/tanpa-handler'), /\[Mock\] Tidak ada handler untuk GET \/tanpa-handler/);
});
