// Step 6.4.9 · FR-34 · AD-09 — aturan murni voucher & loyalty (port client utils/rules/adminPromo.js) di
// services/adminPromoRules.service.js, termasuk aturan kuota expected_quota.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBigIntIdString, normalizeVoucherInput, validateVoucher, resolveQuotaUpdate, getAdminVoucherStatus, normalizeLoyaltyInput, validateLoyaltyRules, QUOTA_MESSAGES,
} = require('../src/services/adminPromoRules.service');

const T = '2026-10-16';
const ok = { codeTaken: false, productExists: true };
const v = (x = {}, ctx = ok) => validateVoucher(normalizeVoucherInput({
  code: 'HEMAT5', title: 'Hemat', discount_type: 'amount', discount_value: '5000', quota: '10', valid_from: T, valid_to: T, is_active: true, ...x,
}), ctx);

test('normalizeVoucherInput: kode trim + huruf besar, angka dari teks, produk kosong = semua', () => {
  assert.deepEqual(normalizeVoucherInput({ code: ' weekend15 ', title: ' Hemat ', discount_type: 'percent', discount_value: '15', product_id: '', quota: '50', valid_from: T, valid_to: T, is_active: true }), {
    code: 'WEEKEND15', title: 'Hemat', discount_type: 'percent', discount_value: 15, product_id: null, quota: 50, valid_from: T, valid_to: T, is_active: true,
  });
  assert.deepEqual([normalizeVoucherInput({ product_id: 4 }).product_id, normalizeVoucherInput({}).is_active, normalizeVoucherInput({}).quota], ['4', false, null]);
});

test('validateVoucher: sama dengan uji client step-5.8 (wajib, kode, persen, periode)', () => {
  assert.deepEqual(Object.keys(validateVoucher(normalizeVoucherInput({}), ok)).sort(), ['code', 'discount_type', 'discount_value', 'quota', 'title', 'valid_from', 'valid_to']);
  assert.deepEqual([v({}, { ...ok, codeTaken: true }).code, v({ code: 'A B' }).code, v({ discount_type: 'percent', discount_value: 120 }).discount_value, v({ valid_to: '2026-10-01' }).valid_to],
    ['Kode voucher sudah dipakai', 'Kode hanya huruf dan angka tanpa spasi', 'Persen diskon berupa bilangan bulat 1–100', 'Tanggal berakhir tidak boleh sebelum tanggal mulai']);
  assert.deepEqual(v({}), {});
});

test('validateVoucher: batas panjang, nilai diskon, produk, kuota, tanggal sah', () => {
  assert.equal(v({ code: 'A'.repeat(21) }).code, 'Kode maksimal 20 karakter');
  assert.equal(v({ code: 'diskon-10' }).code, 'Kode hanya huruf dan angka tanpa spasi');
  assert.equal(v({ title: 'x'.repeat(101) }).title, 'Judul maksimal 100 karakter');
  assert.equal(v({ discount_type: 'gratis' }).discount_type, 'Pilih jenis diskon');
  for (const value of ['0', '-5', 'abc', '']) assert.equal(v({ discount_value: value }).discount_value, 'Nilai diskon harus lebih dari 0', value);
  assert.equal(v({ discount_type: 'percent', discount_value: '12.5' }).discount_value, 'Persen diskon berupa bilangan bulat 1–100');
  assert.equal(v({ discount_type: 'percent', discount_value: '100' }).discount_value, undefined);
  assert.equal(v({ discount_value: '5000.50' }).discount_value, 'Nominal diskon berupa bilangan bulat rupiah');
  assert.equal(v({ discount_value: '10000000000' }).discount_value, 'Nominal diskon berupa bilangan bulat rupiah');
  assert.equal(v({ product_id: '99' }, { ...ok, productExists: false }).product_id, 'Produk tidak ditemukan');
  assert.equal(v({ product_id: '' }, { ...ok, productExists: false }).product_id, undefined); // semua produk
  for (const quota of ['-1', '100001', '2.5', '', 'x']) assert.equal(v({ quota }).quota, 'Kuota berupa bilangan bulat 0–100.000', quota);
  assert.deepEqual([v({ quota: '0' }).quota, v({ quota: '100000' }).quota], [undefined, undefined]);
  for (const date of ['2026-02-30', '16-10-2026', '0999-01-01', '']) assert.equal(v({ valid_from: date }).valid_from, 'Pilih tanggal mulai', date);
  assert.equal(v({ valid_to: '2026-13-01' }).valid_to, 'Pilih tanggal berakhir');
});

test('resolveQuotaUpdate: edit informasi tidak menulis kuota; perubahan wajib expected & tidak basi', () => {
  // kuota form = expected → tidak ditulis walau database sudah berubah (pemakaian tetap utuh)
  assert.equal(resolveQuotaUpdate(50, '50', 47), null);
  // kuota form = kuota terkunci → tidak ditulis (tanpa expected pun boleh)
  assert.equal(resolveQuotaUpdate(47, undefined, 47), null);
  // perubahan kuota dengan expected cocok → ditulis
  assert.equal(resolveQuotaUpdate(80, '47', 47), 80);
  assert.equal(resolveQuotaUpdate(0, 47, 47), 0);
  // tanpa expected → 400; expected basi → 409; expected tidak sah → 400 — semua fieldErrors.quota
  const err = (fn) => { try { fn(); } catch (e) { return [e.statusCode, e.message, e.fieldErrors.quota === e.message]; } return null; };
  assert.deepEqual(err(() => resolveQuotaUpdate(80, undefined, 47)), [400, QUOTA_MESSAGES.EXPECTED_QUOTA_REQUIRED, true]);
  assert.deepEqual(err(() => resolveQuotaUpdate(80, '', 47)), [400, QUOTA_MESSAGES.EXPECTED_QUOTA_REQUIRED, true]);
  assert.deepEqual(err(() => resolveQuotaUpdate(80, '50', 47)), [409, QUOTA_MESSAGES.QUOTA_CHANGED, true]);
  assert.deepEqual(err(() => resolveQuotaUpdate(80, 'abc', 47)), [400, QUOTA_MESSAGES.EXPECTED_QUOTA_INVALID, true]);
  assert.deepEqual(err(() => resolveQuotaUpdate(80, '-1', 47)), [400, QUOTA_MESSAGES.EXPECTED_QUOTA_INVALID, true]);
});

test('getAdminVoucherStatus: urutan nonaktif → berakhir → kuota habis → terjadwal → aktif (sama dengan client)', () => {
  const st = (x) => getAdminVoucherStatus({ is_active: true, quota: 5, valid_from: '2026-10-10', valid_to: '2026-10-20', ...x }, T);
  assert.deepEqual([st({}), st({ is_active: false }), st({ quota: 0 }), st({ valid_to: '2026-10-15' }), st({ valid_from: '2026-10-17' })], ['aktif', 'nonaktif', 'kuota_habis', 'berakhir', 'terjadwal']);
  assert.equal(st({ is_active: false, quota: 0, valid_to: '2026-10-01' }), 'nonaktif');
  assert.equal(st({ valid_from: T, valid_to: T }), 'aktif'); // batas inklusif
});

test('validateLoyaltyRules: sah, Platinum ≤ Gold, nol, pecahan, batas atas, kosong', () => {
  const lr = (x = {}) => validateLoyaltyRules(normalizeLoyaltyInput({ earn_amount_per_point: '1000', redeem_points_unit: '100', redeem_value: '5000', gold_min_points: '500', platinum_min_points: '2000', ...x }));
  assert.deepEqual(lr(), {});
  assert.deepEqual([lr({ platinum_min_points: 500 }).platinum_min_points, lr({ earn_amount_per_point: 0 }).earn_amount_per_point, lr({ redeem_points_unit: 1.5 }).redeem_points_unit],
    ['Ambang Platinum harus lebih besar dari ambang Gold', 'Belanja per poin berupa bilangan bulat lebih dari 0', 'Poin per penukaran berupa bilangan bulat lebih dari 0']);
  assert.equal(lr({ redeem_value: 10000001 }).redeem_value, 'Nilai penukaran maksimal 10.000.000');
  assert.equal(lr({ gold_min_points: 1000001 }).gold_min_points, 'Ambang Gold maksimal 1.000.000');
  assert.deepEqual(Object.keys(validateLoyaltyRules(normalizeLoyaltyInput({}))).sort(), ['earn_amount_per_point', 'gold_min_points', 'platinum_min_points', 'redeem_points_unit', 'redeem_value']);
  // Platinum vs Gold hanya dibandingkan bila keduanya sah
  assert.deepEqual(Object.keys(lr({ gold_min_points: 'x', platinum_min_points: 1 })), ['gold_min_points']);
});

test('product_id BIGINT: valid, tepat batas maksimum, satu di atas batas, format tidak sah (tanpa Number)', () => {
  // ID valid & tepat pada batas BIGINT signed MySQL
  for (const id of ['1', '4', '9223372036854775807']) assert.equal(isBigIntIdString(id), true, id);
  // satu di atas batas, 19 digit terbesar, 20 digit, format tidak sah
  for (const id of ['9223372036854775808', '9999999999999999999', '10000000000000000000', '0', '007', '-1', '1.5', '1e3', ' 4', 'abc', '', null, 4]) {
    assert.equal(isBigIntIdString(id), false, String(id));
  }
  // normalisasi: teks di-trim; angka aman → teks; angka JSON di luar safe integer → tidak sah (presisi sudah hilang)
  assert.deepEqual(['4', ' 4 ', 4, 9007199254740991].map((x) => normalizeVoucherInput({ product_id: x }).product_id), ['4', '4', '4', '9007199254740991']);
  assert.equal(isBigIntIdString(normalizeVoucherInput({ product_id: 9007199254740993 }).product_id), false);
  assert.equal(isBigIntIdString(normalizeVoucherInput({ product_id: 1e21 }).product_id), false);
  // validateVoucher: ID tidak sah → fieldErrors.product_id walau productExists (pengaman ganda); ID sah → tidak ada error
  assert.equal(v({ product_id: '9223372036854775808' }).product_id, 'Produk tidak ditemukan');
  assert.equal(v({ product_id: 'abc' }).product_id, 'Produk tidak ditemukan');
  assert.equal(v({ product_id: '9223372036854775807' }).product_id, undefined);
});
