// Uji Step 6.6 (CP6) mode mock — kontrak mock = API untuk form admin: aturan expected_stock (AD-07, G7) dan
// expected_quota (AD-09, G8) termasuk konflik 409/400 + fieldErrors, voucher khusus produk (G17), dan fieldErrors
// form voucher, bahan baku, staf (G13). Tanpa fetch.

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
const { getRawMaterials, saveMaterial, recordStockIn } = await import('../../src/services/stockService.js');
const { getAdminVouchers, saveVoucher } = await import('../../src/services/adminPromoService.js');
const { addAdminAccount } = await import('../../src/services/settingsService.js');
const { updateTable } = await import('../../src/services/mock/db.js');
const { withExpectedValue } = await import('../../src/utils/businessRules.js');
const { MATERIAL_STOCK_MESSAGE } = await import('../../src/constants/adminCatalog.js');
const { VOUCHER_QUOTA_MESSAGE } = await import('../../src/constants/adminPromo.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const asOwner = () => useAuthStore.setState({ user: { user_id: 3, role: 'owner' }, token: 'mock_token_3' });
const materialForm = (m, extra = {}) => ({ name: m.name, unit: m.unit, stock: String(m.stock), min_stock: String(m.min_stock), ...extra });
const voucherForm = (v, extra = {}) => ({
  code: v.code, title: v.title, discount_type: v.discount_type, discount_value: String(v.discount_value),
  product_id: v.product_id == null ? '' : String(v.product_id), quota: String(v.quota), valid_from: v.valid_from,
  valid_to: v.valid_to, is_active: v.is_active, ...extra,
});
const materialById = async (id) => (await getRawMaterials()).rows.find((m) => m.material_id === id);
const voucherById = async (id) => (await getAdminVouchers()).rows.find((v) => v.voucher_id === id);
const setQuota = (id, quota) => updateTable('vouchers', (rows) => rows.map((v) => (v.voucher_id === id ? { ...v, quota } : v)));

test.beforeEach(() => { store.clear(); fetchCalls = 0; asOwner(); });
test.after(() => assert.equal(fetchCalls, 0));

test('mode mock aktif', () => assert.equal(USE_MOCK, true));

test('G7 mock: edit nama dengan form lama setelah stok masuk → stok masuk TIDAK tertimpa (sama dengan API)', async () => {
  const opened = (await getRawMaterials()).rows[0];
  await recordStockIn(opened.material_id, 5);
  const saved = await saveMaterial(opened.material_id, withExpectedValue(materialForm(opened, { name: `${opened.name} Baru` }), opened, 'stock', 'expected_stock'));
  assert.equal(saved.name, `${opened.name} Baru`);
  assert.equal((await materialById(opened.material_id)).stock, Math.round((opened.stock + 5) * 100) / 100);
});

test('G7 mock: koreksi stok dengan stok awal basi → 409 + fieldErrors.stock (pesan API); stok tidak berubah', async () => {
  const opened = (await getRawMaterials()).rows[0];
  await recordStockIn(opened.material_id, 2);
  const err = await saveMaterial(opened.material_id, withExpectedValue(materialForm(opened, { stock: '1' }), opened, 'stock', 'expected_stock')).catch((e) => e);
  assert.equal(err.status, 409);
  assert.equal(err.message, MATERIAL_STOCK_MESSAGE.changedMessage);
  assert.deepEqual(err.fieldErrors, { stock: MATERIAL_STOCK_MESSAGE.changedMessage });
  assert.equal((await materialById(opened.material_id)).stock, Math.round((opened.stock + 2) * 100) / 100);
});

test('G7 mock: koreksi tanpa expected_stock → 400 fieldErrors.stock; koreksi dengan stok awal terbaru → tersimpan', async () => {
  const opened = (await getRawMaterials()).rows[0];
  const err = await saveMaterial(opened.material_id, materialForm(opened, { stock: '1' })).catch((e) => e);
  assert.equal(err.status, 400);
  assert.deepEqual(err.fieldErrors, { stock: MATERIAL_STOCK_MESSAGE.requiredMessage });
  await saveMaterial(opened.material_id, withExpectedValue(materialForm(opened, { stock: '1' }), opened, 'stock', 'expected_stock'));
  assert.equal((await materialById(opened.material_id)).stock, 1);
});

test('G8 mock: edit judul dengan form lama setelah voucher dipakai → kuota terbaru utuh', async () => {
  const opened = (await getAdminVouchers()).rows[0];
  setQuota(opened.voucher_id, opened.quota - 1);
  await saveVoucher(opened.voucher_id, withExpectedValue(voucherForm(opened, { title: 'Judul Baru' }), opened, 'quota', 'expected_quota'));
  const after = await voucherById(opened.voucher_id);
  assert.equal(after.title, 'Judul Baru');
  assert.equal(after.quota, opened.quota - 1);
});

test('G8 mock: ubah kuota basi → 409 fieldErrors.quota; tanpa expected → 400; kuota awal terbaru → tersimpan', async () => {
  const opened = (await getAdminVouchers()).rows[0];
  setQuota(opened.voucher_id, opened.quota + 1);
  const stale = await saveVoucher(opened.voucher_id, withExpectedValue(voucherForm(opened, { quota: '50' }), opened, 'quota', 'expected_quota')).catch((e) => e);
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.fieldErrors, { quota: VOUCHER_QUOTA_MESSAGE.changedMessage });
  const missing = await saveVoucher(opened.voucher_id, voucherForm(opened, { quota: '50' })).catch((e) => e);
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.fieldErrors, { quota: VOUCHER_QUOTA_MESSAGE.requiredMessage });
  const fresh = await voucherById(opened.voucher_id);
  await saveVoucher(opened.voucher_id, withExpectedValue(voucherForm(fresh, { quota: '50' }), fresh, 'quota', 'expected_quota'));
  assert.equal((await voucherById(opened.voucher_id)).quota, 50);
});

test('G17 mock: buat voucher khusus produk (id dari form berupa string) & voucher umum → tersimpan', async () => {
  const board = await getAdminVouchers();
  const product = board.products.find((p) => p.is_active);
  const base = { title: 'Uji', discount_type: 'percent', discount_value: '10', quota: '5', valid_from: board.todayKey, valid_to: board.todayKey, is_active: true };
  const specific = await saveVoucher(null, { ...base, code: 'UJIPRODUK', product_id: String(product.product_id) });
  assert.equal(String(specific.product_id), String(product.product_id));
  assert.equal((await getAdminVouchers()).rows.find((v) => v.code === 'UJIPRODUK').product_name, product.name);
  const general = await saveVoucher(null, { ...base, code: 'UJIUMUM', product_id: '' });
  assert.equal(general.product_id, null);
});

test('G13 mock: fieldErrors form voucher (kode ganda), bahan baku (nama ganda), staf (email & HP pelanggan)', async () => {
  const board = await getAdminVouchers();
  const v = board.rows[0];
  const voucherErr = await saveVoucher(null, voucherForm(v)).catch((e) => e);
  assert.equal(voucherErr.fieldErrors.code, 'Kode voucher sudah dipakai');
  const m = (await getRawMaterials()).rows[0];
  const materialErr = await saveMaterial(null, materialForm(m)).catch((e) => e);
  assert.equal(materialErr.fieldErrors.name, 'Bahan dengan nama ini sudah ada');
  const staffErr = await addAdminAccount({ name: 'Staf Baru', email: 'pelanggan@demo.com', phone: '+6281234567890', password: 'rahasia123', role: 'staf' }).catch((e) => e);
  assert.ok(staffErr.fieldErrors.email && staffErr.fieldErrors.phone, JSON.stringify(staffErr.fieldErrors));
  assert.equal(staffErr.message, Object.values(staffErr.fieldErrors)[0]);
});
