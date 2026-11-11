// Uji CR-03 CP6 mode mock · FR-39 · UC-31 · BR-13 · AD-06 — recipeService + mock/recipeAdmin.js = kontrak API CR-03
// §B7.1 – §B7.2 (bentuk respons, pesan, fieldErrors sama dengan server). Seed komposisi = seed server. Tanpa fetch.
// AC-39.1 (aktif & nonaktif, isi/ubah/kosongkan), AC-39.2 (hanya master bahan), AC-39.3 (validasi per baris),
// AC-39.4 (string "0.015" → number 0.015), AC-39.5 (satuan = raw_materials.unit saat ini), AC-39.7 (peran), AC-39.8.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';

register('./mock-env-loader.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('mode mock tidak boleh memanggil fetch'); };

const require = createRequire(import.meta.url);
const serverSeed = require('../../../server/prisma/seed/catalog.js');
const { QTY_CASES } = require('../../../server/tests/helpers/recipeFixtures.js');
const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { getProductRecipe, saveProductRecipe } = await import('../../src/services/recipeService.js');
const { getTables, updateTable } = await import('../../src/services/mock/db.js');
const { PRODUCT_MATERIALS } = await import('../../src/services/mock/seed/catalog.js');
const { toQtyText } = await import('../../src/hooks/useRecipeForm.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const as = (role) => useAuthStore.setState({ user: { user_id: role === 'customer' ? 7 : 3, role }, token: `mock_token_${role}` });
const storedOf = (productId) => getTables('product_materials').product_materials.filter((r) => r.product_id === productId)
  .map((r) => [r.material_id, r.qty_per_unit]);
const failOf = async (promise) => promise.then(() => assert.fail('harus gagal'), (err) => err);

test.beforeEach(() => { store.clear(); fetchCalls = 0; as('staf'); });
test.after(() => assert.equal(fetchCalls, 0));

test('mode mock aktif; seed komposisi client = seed server (24 baris)', () => {
  assert.equal(USE_MOCK, true);
  const server = serverSeed.PRODUCT_MATERIALS.map((r) => [r.productId, r.materialId, r.qtyPerUnit]);
  assert.deepEqual(PRODUCT_MATERIALS.map((r) => [r.product_id, r.material_id, r.qty_per_unit]), server);
  assert.equal(PRODUCT_MATERIALS.length, 24);
});

test('GET B7.1: ID string, takaran number, satuan bahan saat ini; produk nonaktif & tanpa komposisi', async () => {
  const croissant = await getProductRecipe(1);
  assert.deepEqual([croissant.product_id, croissant.product_name, croissant.availability_type], ['1', 'Classic Butter Croissant', 'ready']);
  assert.deepEqual(croissant.items.find((i) => i.material_id === '2'), { material_id: '2', name: 'Butter Prancis', unit: 'kg', qty_per_unit: 0.015 });
  assert.deepEqual(croissant.items.map((i) => i.material_id), ['1', '2', '3', '4', '6', '7']);
  assert.deepEqual((await getProductRecipe(11)).items, []); // Red Velvet Slice nonaktif, tanpa komposisi
  // AC-39.5: satuan berubah di AD-07 → tampil satuan baru, angka takaran tetap
  updateTable('raw_materials', (rows) => rows.map((m) => (m.material_id === 2 ? { ...m, unit: 'gram' } : m)));
  assert.deepEqual((await getProductRecipe('1')).items.find((i) => i.material_id === '2'), { material_id: '2', name: 'Butter Prancis', unit: 'gram', qty_per_unit: 0.015 });
});

test('PUT AC-39.1/AC-39.4: ganti seluruh komposisi, produk nonaktif boleh, kosongkan; takaran 3 desimal eksak', async () => {
  const saved = await saveProductRecipe(11, [{ material_id: '3', qty_per_unit: '9999999.999' }, { material_id: '2', qty_per_unit: '0.015' }]);
  assert.deepEqual(saved.items.map((i) => [i.material_id, i.qty_per_unit, i.unit]), [['2', 0.015, 'kg'], ['3', 9999999.999, 'kg']]);
  assert.deepEqual(storedOf(11), [[3, '9999999.999'], [2, '0.015']]);
  assert.deepEqual(storedOf(1).length, 6, 'komposisi produk lain tidak tersentuh');
  const cleared = await saveProductRecipe(11, []);
  assert.deepEqual([cleared.items, storedOf(11)], [[], []]);
});

test('AC-39.8: isi identik / beda urutan / beda format → tidak ditulis ulang', async () => {
  await saveProductRecipe(5, [{ material_id: '2', qty_per_unit: '0.25' }, { material_id: '1', qty_per_unit: '0.3' }]);
  const before = storedOf(5);
  await saveProductRecipe(5, [{ material_id: '1', qty_per_unit: '0.300' }, { material_id: 2, qty_per_unit: ' 0.250 ' }]);
  assert.deepEqual(storedOf(5), before, 'urutan tersimpan tetap = tidak ada penulisan');
});

test('AC-39.3: validasi → 400 + fieldErrors per baris (sama server), tanpa perubahan', async () => {
  const before = storedOf(1);
  for (const [value, expected] of QTY_CASES.filter(([, e]) => e)) {
    const err = await failOf(saveProductRecipe(1, [{ material_id: '2', qty_per_unit: value }]));
    assert.deepEqual([err.status, err.fieldErrors], [400, { 'items.0.qty_per_unit': expected }], String(value));
  }
  const dup = await failOf(saveProductRecipe(1, [{ material_id: '2', qty_per_unit: '1' }, { material_id: '2', qty_per_unit: '2' }]));
  assert.deepEqual([dup.message, dup.fieldErrors], ['Bahan sudah ada di komposisi', { 'items.1.material_id': 'Bahan sudah ada di komposisi' }]);
  const unknown = await failOf(saveProductRecipe(1, [{ material_id: '99', qty_per_unit: '1' }])); // AC-39.2
  assert.deepEqual(unknown.fieldErrors, { 'items.0.material_id': 'Bahan tidak terdaftar' });
  const many = await failOf(saveProductRecipe(1, Array.from({ length: 31 }, () => ({ material_id: '1', qty_per_unit: '1' }))));
  assert.equal(many.fieldErrors.items, 'Maksimal 30 bahan per produk');
  assert.deepEqual(storedOf(1), before);
});

test('404 / 400 ID produk & AC-39.7 peran (pelanggan & tanpa sesi ditolak)', async () => {
  const missing = await failOf(getProductRecipe(999));
  assert.deepEqual([missing.status, missing.message], [404, 'Produk tidak ditemukan.']);
  const invalid = await failOf(saveProductRecipe('abc', []));
  assert.deepEqual([invalid.status, invalid.message], [400, 'ID produk tidak valid.']);
  as('owner');
  assert.equal((await getProductRecipe(1)).product_id, '1');
  as('customer');
  assert.match((await failOf(getProductRecipe(1))).message, /Akses ditolak/);
  useAuthStore.setState({ user: null, token: null });
  assert.match((await failOf(saveProductRecipe(1, []))).message, /Silakan masuk/);
});

test('form: koma desimal diubah ke titik sebelum validasi & kirim', () => {
  assert.deepEqual(['0,015', ' 2 ', '0.5', '1,'].map(toQtyText), ['0.015', '2', '0.5', '1.']);
});

test('K-06: peringatan ubah satuan hanya di form ubah & saat satuan berbeda; teks sesuai CR-03 §B8', async () => {
  const { isMaterialUnitChanged } = await import('../../src/utils/rules/recipe.js');
  const { MATERIAL_UNIT_CHANGE_WARNING } = await import('../../src/constants/recipe.js');
  const butter = { material_id: 2, unit: 'kg' };
  assert.deepEqual(
    [isMaterialUnitChanged(butter, 'kg'), isMaterialUnitChanged(butter, ' kg '), isMaterialUnitChanged(butter, 'gram'),
      isMaterialUnitChanged(butter, ''), isMaterialUnitChanged(null, 'gram'), isMaterialUnitChanged(undefined, '')],
    [false, false, true, true, false, false],
  );
  assert.equal(MATERIAL_UNIT_CHANGE_WARNING, 'Satuan ini juga menjadi satuan takaran di komposisi produk. Mengubah satuan tidak '
    + 'mengubah angka takaran yang sudah tersimpan; periksa kembali komposisi produk yang memakai bahan ini.');
});
