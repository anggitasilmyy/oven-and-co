// Uji mode mock — Step 6.6 (CP5): penyimpanan foto produk mode mock TIDAK berubah (data URL disimpan apa adanya, tanpa fetch).

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { saveProduct, getAdminProduct } = await import('../../src/services/adminProductService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('mode mock: foto baru (data URL) tersimpan apa adanya bersama foto lama; tanpa fetch', async () => {
  assert.equal(USE_MOCK, true);
  useAuthStore.setState({ user: { user_id: 2, role: 'staf' }, token: 'mock_token_2' });
  const form = await getAdminProduct(2);
  const photos = [...form.photos.map((p) => ({ image_id: p.image_id, image_url: p.image_url })), { image_id: null, image_url: PNG_1PX }];
  await saveProduct(2, { ...form, category_id: String(form.category_id), price: String(form.price), lead_time_days: String(form.lead_time_days), photos });
  const after = await getAdminProduct(2);
  assert.equal(after.photos.length, form.photos.length + 1);
  assert.equal(after.photos.at(-1).image_url, PNG_1PX);
  assert.equal(fetchCalls, 0);
});
