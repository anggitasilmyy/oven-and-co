// Uji Step 6.6 (CP5 · G5) — body PUT/POST /api/admin/products mode API sesuai kontrak server (adminProductSave.service):
// foto tersimpan → { image_id }; foto baru (data URL) → file multipart `photos` + { file_index }; tanpa foto baru → JSON.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ data: { product_id: '2' } }) }; };

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { saveProduct } = await import('../../src/services/adminProductService.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_DATA = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]).toString('base64')}`;
const base = { name: 'Cinnamon Roll', category_id: 1, price: 32000, availability_type: 'ready', lead_time_days: 0, is_active: true, variants: [] };

test.beforeEach(() => {
  calls.length = 0;
  useAuthStore.setState({ user: { userId: '2', role: 'staf' }, token: 'jwt-staf' });
});

test('mode API aktif', () => assert.equal(USE_MOCK, false));

test('tanpa foto baru → JSON; foto tersimpan dikirim sebagai { image_id } saja (image_url tidak dikirim)', async () => {
  await saveProduct(2, { ...base, photos: [{ image_id: '14', image_url: '/images/products/b.webp' }, { image_id: '2', image_url: '/uploads/products/a.png' }] });
  const { init } = calls[0];
  assert.equal(init.method, 'PUT');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body).photos, [{ image_id: '14' }, { image_id: '2' }]);
});

test('foto lama + foto baru → multipart: field `product` (JSON) + file `photos`; urutan & file_index sesuai daftar', async () => {
  await saveProduct(2, { ...base, photos: [
    { image_id: null, image_url: JPEG_DATA }, { image_id: '2', image_url: '/images/x.webp' }, { image_id: null, image_url: PNG_1PX },
  ] });
  const { init } = calls[0];
  assert.ok(init.body instanceof FormData);
  assert.equal(init.headers['Content-Type'], undefined); // boundary diatur fetch
  assert.equal(init.headers.Authorization, 'Bearer jwt-staf');
  const product = JSON.parse(init.body.get('product'));
  assert.deepEqual(product.photos, [{ file_index: 0 }, { image_id: '2' }, { file_index: 1 }]);
  assert.equal(product.name, 'Cinnamon Roll');
  const files = init.body.getAll('photos');
  assert.deepEqual(files.map((f) => [f.name, f.type]), [['foto-1.jpg', 'image/jpeg'], ['foto-2.png', 'image/png']]);
  assert.equal(init.body.getAll('product').length, 1);
});

test('tambah produk baru dengan 5 foto baru → POST multipart, file_index 0..4', async () => {
  await saveProduct(null, { ...base, photos: Array.from({ length: 5 }, () => ({ image_id: null, image_url: PNG_1PX })) });
  const { url, init } = calls[0];
  assert.match(url, /\/admin\/products$/);
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body.get('product')).photos.map((p) => p.file_index), [0, 1, 2, 3, 4]);
  assert.equal(init.body.getAll('photos').length, 5);
});

test('hapus semua foto → JSON photos [] (server melepas foto lama)', async () => {
  await saveProduct(2, { ...base, photos: [] });
  assert.deepEqual(JSON.parse(calls[0].init.body).photos, []);
});

test('data URL tidak terbaca → error berbahasa Indonesia, tidak ada request', async () => {
  await assert.rejects(saveProduct(2, { ...base, photos: [{ image_id: null, image_url: 'data:text/plain;base64,QUJD' }] }), /Foto produk tidak bisa dibaca/);
  assert.equal(calls.length, 0);
});

test('tanpa properti photos → body apa adanya (PUT mempertahankan foto lama)', async () => {
  await saveProduct(2, { ...base });
  assert.equal(JSON.parse(calls[0].init.body).photos, undefined);
});
