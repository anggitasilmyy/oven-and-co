// Uji Step 6.6 (CP6) mode API — kontrak form admin: AD-07 bahan baku mengirim `expected_stock` (G7), AD-09 voucher
// mengirim `expected_quota` (G8), id produk string dari API diterima validasi voucher (G17), serta `fieldErrors` & status
// 400/409 server diteruskan ke form voucher, bahan baku, dan staf (G13). fetch ditangkap; tanpa server sungguhan.

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const calls = [];
let reply = { status: 200, body: { data: { name: 'Tepung', code: 'X' } } };
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
};

const { USE_MOCK } = await import('../../src/services/apiClient.js');
const { saveMaterial } = await import('../../src/services/stockService.js');
const { saveVoucher } = await import('../../src/services/adminPromoService.js');
const { addAdminAccount } = await import('../../src/services/settingsService.js');
const { withExpectedValue, normalizeVoucherInput, validateVoucher } = await import('../../src/utils/businessRules.js');
const { HTTP_STATUS_CONFLICT } = await import('../../src/constants/apiErrors.js');
const { default: useAuthStore } = await import('../../src/stores/useAuthStore.js');

const bodyOf = (i = 0) => JSON.parse(calls[i].init.body);
const material = { material_id: '4', name: 'Tepung', unit: 'kg', stock: 12.5, min_stock: 2 };
const materialForm = { name: 'Tepung', unit: 'kg', stock: '12.5', min_stock: '2' };
const voucher = { voucher_id: '2', code: 'WEEKEND15', quota: 37 };
const voucherForm = {
  code: 'WEEKEND15', title: 'Diskon', discount_type: 'percent', discount_value: '15', product_id: '3', quota: '37',
  valid_from: '2026-11-01', valid_to: '2026-11-30', is_active: true,
};

test.beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, body: { data: { name: 'Tepung', code: 'X', role: 'staf' } } };
  useAuthStore.setState({ user: { userId: '3', role: 'owner' }, token: 'jwt-owner' });
});

test('mode API aktif', () => assert.equal(USE_MOCK, false));

test('G7 AD-07: ubah bahan → PUT membawa expected_stock = stok saat form dibuka; tambah → POST tanpa expected_stock', async () => {
  await saveMaterial(material.material_id, withExpectedValue({ ...materialForm, stock: '20' }, material, 'stock', 'expected_stock'));
  assert.equal(calls[0].init.method, 'PUT');
  assert.match(calls[0].url, /\/admin\/raw-materials\/4$/);
  assert.deepEqual(bodyOf(), { ...materialForm, stock: '20', expected_stock: '12.5' });
  await saveMaterial(null, withExpectedValue(materialForm, null, 'stock', 'expected_stock'));
  assert.equal(calls[1].init.method, 'POST');
  assert.equal('expected_stock' in bodyOf(1), false);
});

test('G8 AD-09: ubah voucher → PUT membawa expected_quota = kuota saat form dibuka; buat → POST tanpa expected_quota', async () => {
  await saveVoucher(voucher.voucher_id, withExpectedValue({ ...voucherForm, title: 'Baru' }, voucher, 'quota', 'expected_quota'));
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(bodyOf(), { ...voucherForm, title: 'Baru', expected_quota: '37' });
  await saveVoucher(null, withExpectedValue(voucherForm, null, 'quota', 'expected_quota'));
  assert.equal(calls[1].init.method, 'POST');
  assert.equal('expected_quota' in bodyOf(1), false);
});

test('G7/G8: 409 server (nilai berubah sejak form dibuka) → error status 409 + fieldErrors stock/quota', async () => {
  reply = { status: 409, body: { status: 'fail', message: 'Stok bahan sudah berubah', fieldErrors: { stock: 'Stok bahan sudah berubah' } } };
  const stockErr = await saveMaterial('4', withExpectedValue(materialForm, material, 'stock', 'expected_stock')).catch((e) => e);
  assert.equal(stockErr.status, HTTP_STATUS_CONFLICT);
  assert.deepEqual(stockErr.fieldErrors, { stock: 'Stok bahan sudah berubah' });
  reply = { status: 409, body: { status: 'fail', message: 'Kuota voucher sudah berubah', fieldErrors: { quota: 'Kuota voucher sudah berubah' } } };
  const quotaErr = await saveVoucher('2', withExpectedValue(voucherForm, voucher, 'quota', 'expected_quota')).catch((e) => e);
  assert.equal(quotaErr.status, HTTP_STATUS_CONFLICT);
  assert.deepEqual(quotaErr.fieldErrors, { quota: 'Kuota voucher sudah berubah' });
});

test('G17: voucher khusus produk dengan id string dari API (products [{product_id: "3"}]) lolos validasi form', () => {
  const ctx = { vouchers: [], voucherId: null, products: [{ product_id: '3', name: 'Croissant', is_active: true }] };
  assert.equal(validateVoucher(normalizeVoucherInput(voucherForm), ctx).product_id, undefined);
  assert.equal(validateVoucher(normalizeVoucherInput({ ...voucherForm, product_id: '' }), ctx).product_id, undefined, 'voucher umum');
  assert.equal(validateVoucher(normalizeVoucherInput({ ...voucherForm, product_id: '99' }), ctx).product_id, 'Produk tidak ditemukan');
});

test('G17: id angka (data mock) tetap didukung — form mengirim string "3", produk mock 3', () => {
  const ctx = { vouchers: [], voucherId: null, products: [{ product_id: 3, name: 'Croissant', is_active: true }] };
  assert.equal(validateVoucher(normalizeVoucherInput(voucherForm), ctx).product_id, undefined);
  assert.equal(validateVoucher(normalizeVoucherInput({ ...voucherForm, product_id: 3 }), ctx).product_id, undefined);
});

test('G17: id produk voucher dikirim ke server apa adanya (string), bukan dibulatkan ke Number', async () => {
  await saveVoucher(null, { ...voucherForm, product_id: '3' });
  assert.equal(bodyOf().product_id, '3');
});

test('G13: 400 fieldErrors server diteruskan untuk form voucher, bahan baku, dan staf (kunci field sama)', async () => {
  const cases = [
    [() => saveVoucher(null, voucherForm), { code: 'Kode voucher sudah dipakai' }],
    [() => saveMaterial(null, materialForm), { name: 'Bahan dengan nama ini sudah ada' }],
    [() => addAdminAccount({ name: 'A', email: 'pelanggan@demo.com', phone: '+6281234567890', password: 'rahasia123', role: 'staf' }),
      { email: 'Email sudah terdaftar', phone: 'Nomor HP sudah terdaftar' }],
  ];
  for (const [run, fieldErrors] of cases) {
    reply = { status: 400, body: { status: 'fail', message: Object.values(fieldErrors)[0], fieldErrors } };
    const err = await run().catch((e) => e);
    assert.equal(err.status, 400);
    assert.equal(err.message, Object.values(fieldErrors)[0]);
    assert.deepEqual(err.fieldErrors, fieldErrors);
  }
});

test('G13: error umum tanpa fieldErrors tetap membawa pesan (ditampilkan FormError)', async () => {
  reply = { status: 500, body: { status: 'error', message: 'Terjadi kesalahan pada server.' } };
  const err = await saveVoucher(null, voucherForm).catch((e) => e);
  assert.equal(err.message, 'Terjadi kesalahan pada server.');
  assert.equal(err.fieldErrors, undefined);
});
