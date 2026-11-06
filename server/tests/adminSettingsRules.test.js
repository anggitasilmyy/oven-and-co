// Uji aturan murni & validator bentuk Step 6.4.10 AD-11 Pengaturan (FR-36 · BR-05 · BR-12 · TF-10).
// Pesan & kunci fieldErrors = client utils/rules/settings.js (mock settingsAdmin.js); perbedaan disengaja diuji eksplisit.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toDecimalText, normalizeStoreProfile, validateStoreProfile, normalizeOperatingHours, validateOperatingHours,
  paymentMethodToggleError, toStoreProfile, toOperatingHourView, toPaymentMethodView, SETTINGS_MESSAGES,
} = require('../src/services/adminSettingsRules.service');
const {
  validateStoreProfileBody, validateOperatingHoursBody, validatePaymentMethodCode, validateActiveBody, validateStaffBody,
  validateStaffId, SETTINGS_VALIDATION_TEXT: T,
} = require('../src/validators/adminSettings.validator');

// Body persis seperti StoreProfileForm (semua nilai teks)
const FORM = {
  store_name: '  Oven & Co.  ', address: ' Jl. Oven & Co. No. 1, Jakarta ', whatsapp_number: '+62 812 3456 7890',
  preorder_cutoff_time: '17:00', delivery_radius_km: '10', delivery_fee_per_km: '2500',
};
const errorsOf = (patch) => validateStoreProfile(normalizeStoreProfile({ ...FORM, ...patch }));

test('profil: normalisasi form teks (trim, spasi WhatsApp dihapus, angka → teks desimal kanonik) dan sah', () => {
  assert.deepEqual(normalizeStoreProfile(FORM), {
    store_name: 'Oven & Co.', address: 'Jl. Oven & Co. No. 1, Jakarta', whatsapp_number: '+6281234567890',
    preorder_cutoff_time: '17:00', delivery_radius_km: '10', delivery_fee_per_km: '2500',
  });
  assert.deepEqual(errorsOf({}), {});
  assert.deepEqual(errorsOf({ delivery_radius_km: 2.5, delivery_fee_per_km: 0 }), {}); // number & tarif 0 (gratis) sah
});

test('profil: wajib isi dan panjang maksimal (pesan mock)', () => {
  assert.deepEqual(errorsOf({ store_name: ' ', address: '', whatsapp_number: '', preorder_cutoff_time: '', delivery_radius_km: '', delivery_fee_per_km: null }), {
    store_name: 'Isi nama toko',
    address: 'Isi alamat toko (ditampilkan untuk pickup dan struk)',
    whatsapp_number: 'Isi nomor WhatsApp toko (tombol hubungi toko di tracking)',
    preorder_cutoff_time: 'Pilih jam batas pre-order',
    delivery_radius_km: 'Radius harus lebih dari 0 km',
    delivery_fee_per_km: 'Tarif berupa bilangan bulat rupiah ≥ 0',
  });
  assert.deepEqual(errorsOf({ store_name: 'a'.repeat(100), address: 'b'.repeat(255) }), {});
  assert.deepEqual(errorsOf({ store_name: 'a'.repeat(101), address: 'b'.repeat(256) }), {
    store_name: 'Nama toko maksimal 100 karakter', address: 'Alamat maksimal 255 karakter',
  });
});

test('profil: WhatsApp mengikuti kontrak mock (+62, 9–13 digit, maks. 20 karakter)', () => {
  const wa = (v) => errorsOf({ whatsapp_number: v }).whatsapp_number;
  assert.equal(wa('+620000000000'), undefined); // data seed
  assert.equal(wa('+628123456'), undefined); // 9 digit termasuk 62 (mock) — lebih longgar dari HP registrasi
  assert.equal(wa('+62-812-3456-7890'), undefined); // tanda hubung diterima mock (digit dihitung)
  assert.equal(wa('081234567890'), 'Nomor WhatsApp harus diawali +62');
  assert.equal(wa('+62812345'), 'Nomor WhatsApp tidak valid'); // 8 digit termasuk 62
  assert.equal(wa('+6281234567890123'), 'Nomor WhatsApp tidak valid'); // 16 digit
  assert.equal(wa('+62-812-3456-7890-123'), 'Nomor maksimal 20 karakter');
});

test('profil: batas jam pre-order HH:mm 00:00–23:59', () => {
  const cut = (v) => errorsOf({ preorder_cutoff_time: v }).preorder_cutoff_time;
  assert.equal(cut('00:00'), undefined);
  assert.equal(cut('23:59'), undefined);
  for (const bad of ['24:00', '7:00', '17:00:00', '17.00', null]) assert.equal(cut(bad), 'Pilih jam batas pre-order', String(bad));
});

test('profil: radius > 0, maks. 999,99, 2 desimal (DECIMAL(5,2)); tarif bulat 0–1.000.000', () => {
  const radius = (v) => errorsOf({ delivery_radius_km: v }).delivery_radius_km;
  const fee = (v) => errorsOf({ delivery_fee_per_km: v }).delivery_fee_per_km;
  for (const ok of ['0.01', '999.99', '1.15', 1.15, '10.10', '7.5']) assert.equal(radius(ok), undefined, String(ok));
  assert.equal(radius('0'), 'Radius harus lebih dari 0 km');
  assert.equal(radius('-1'), 'Radius harus lebih dari 0 km');
  for (const bad of ['1000', '1.234', 0.001]) assert.equal(radius(bad), 'Radius maks. 999.99 km dengan 2 desimal', String(bad));
  assert.equal(fee('1000000'), undefined);
  assert.equal(fee('1000001'), 'Tarif maksimal 1.000.000 per km');
  for (const bad of ['2500.5', '-1', 'abc']) assert.equal(fee(bad), 'Tarif berupa bilangan bulat rupiah ≥ 0', bad);
});

test('M1 radius: presisi dicek dari teks — "1.15" & "1.150" sah; "1.149" & "10.0000000000000001" ditolak', () => {
  const radius = (v) => errorsOf({ delivery_radius_km: v }).delivery_radius_km;
  const TOO_PRECISE = 'Radius maks. 999.99 km dengan 2 desimal';
  assert.equal(radius('1.15'), undefined);
  assert.equal(radius('1.150'), undefined); // nol di belakang koma boleh
  assert.equal(radius('999.990'), undefined); // tepat batas maksimum dengan nol di belakang
  assert.equal(radius('1.149'), TOO_PRECISE);
  // Number() akan membulatkan semua teks ini menjadi nilai ≤ 2 desimal — kini ditolak, bukan disimpan dibulatkan
  for (const silent of ['10.0000000000000001', '1.149999999999999999', '2.9999999999999999', '999.9900000000000001']) {
    const rounded = String(Number(silent));
    assert.ok(rounded !== silent && /^\d+(\.\d{1,2})?$/.test(rounded), `pra-syarat: Number("${silent}") → ${rounded}`);
    assert.equal(radius(silent), TOO_PRECISE, silent);
  }
  assert.equal(radius('0.00'), 'Radius harus lebih dari 0 km'); // batas minimum tetap (> 0)
  assert.equal(radius('999.991'), TOO_PRECISE);
  assert.equal(radius('1000.00'), TOO_PRECISE); // batas maksimum tetap
});

test('M1 tarif: wajib bulat dari teks — "2500" & "2500.00" sah; "2500.01" & "2500.0000000000000001" ditolak', () => {
  const fee = (v) => errorsOf({ delivery_fee_per_km: v }).delivery_fee_per_km;
  const NOT_INTEGER = 'Tarif berupa bilangan bulat rupiah ≥ 0';
  assert.equal(fee('2500'), undefined);
  assert.equal(fee('2500.00'), undefined); // nol di belakang koma boleh
  assert.equal(fee('0'), undefined); // batas minimum tetap (≥ 0)
  assert.equal(fee('1000000.000'), undefined); // tepat batas maksimum
  assert.equal(fee('2500.01'), NOT_INTEGER);
  for (const silent of ['2500.0000000000000001', '1000000.00000000000001', '2499.9999999999999999']) {
    assert.ok(Number.isInteger(Number(silent)), `pra-syarat: ${silent} dibulatkan Number()`);
    assert.equal(fee(silent), NOT_INTEGER, silent);
  }
  assert.equal(fee('1000001.00'), 'Tarif maksimal 1.000.000 per km'); // batas maksimum tetap
});

test('M1 tanpa pembulatan diam-diam: nilai ternormalisasi = teks kanonik persis yang divalidasi (bukan Number)', () => {
  const norm = (radius, fee) => {
    const p = normalizeStoreProfile({ ...FORM, delivery_radius_km: radius, delivery_fee_per_km: fee });
    return [p.delivery_radius_km, p.delivery_fee_per_km];
  };
  assert.deepEqual(norm('1.150', '2500.00'), ['1.15', '2500']);
  assert.deepEqual(norm(' 010.50 ', '0002500'), ['10.5', '2500']);
  assert.deepEqual(norm('0.5', '0'), ['0.5', '0']);
  assert.deepEqual(norm(7.25, 2500), ['7.25', '2500']); // number JSON → String(n)
  assert.deepEqual(norm('10.0000000000000001', '2500.0000000000000001'), ['10.0000000000000001', '2500.0000000000000001']); // tidak dipangkas
  assert.equal(typeof normalizeStoreProfile(FORM).delivery_radius_km, 'string');
});

test('angka form: hanya desimal biasa; hex, eksponen, Infinity → tidak sah (lebih ketat dari mock Number())', () => {
  assert.equal(toDecimalText(' 12.50 '), '12.5');
  assert.equal(toDecimalText('0.00'), '0');
  assert.equal(toDecimalText(''), null);
  assert.equal(toDecimalText(null), null);
  for (const bad of ['0x10', '1e3', 'Infinity', '+5', '-1', '1,5', '.5', '5.', Infinity, NaN, 1e21, true]) {
    assert.ok(Number.isNaN(toDecimalText(bad)), String(bad));
  }
});

const week = (patch = {}) => [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_of_week: d, is_open: true, open_time: '07:00', close_time: '20:00', ...(patch[d] ?? {}) }));

test('jam operasional: urut hari, hari tutup menyimpan jam null, validasi per hari (pesan mock)', () => {
  const rows = normalizeOperatingHours([...week({ 7: { is_open: false } })].reverse());
  assert.deepEqual(rows.map((r) => r.day_of_week), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(rows[6], { day_of_week: 7, is_open: false, open_time: null, close_time: null });
  assert.deepEqual(validateOperatingHours(rows), {});
  const bad = normalizeOperatingHours(week({ 1: { open_time: '20:00' }, 2: { close_time: null }, 3: { open_time: '9:00' }, 4: { close_time: '07:00' } }));
  assert.deepEqual(validateOperatingHours(bad), {
    1: 'Jam tutup harus setelah jam buka', 2: 'Isi jam buka dan jam tutup', 3: 'Isi jam buka dan jam tutup', 4: 'Jam tutup harus setelah jam buka',
  });
  const allClosed = normalizeOperatingHours(week(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { is_open: false, open_time: 'x' }]))));
  assert.deepEqual(validateOperatingHours(allClosed), { all: 'Minimal satu hari toko buka' });
});

const METHODS = [
  { method_code: 'qris', method_group: 'qris', is_active: true },
  { method_code: 'gopay', method_group: 'ewallet', is_active: false },
  { method_code: 'va_bca', method_group: 'va', is_active: false },
  { method_code: 'pay_at_store', method_group: 'store', is_active: true },
];

test('metode bayar: minimal satu metode online aktif (BR-05) → 409; tidak ada → 404; idempoten', () => {
  assert.deepEqual(paymentMethodToggleError(METHODS, 'qris', false), { statusCode: 409, message: SETTINGS_MESSAGES.LAST_ONLINE_METHOD });
  assert.deepEqual(paymentMethodToggleError(METHODS, 'ovo', true), { statusCode: 404, message: 'Metode bayar tidak ditemukan' });
  assert.equal(paymentMethodToggleError(METHODS, 'pay_at_store', false), null); // Bayar di Toko boleh dimatikan
  assert.equal(paymentMethodToggleError(METHODS, 'gopay', false), null); // sudah nonaktif → tanpa perubahan
  assert.equal(paymentMethodToggleError(METHODS, 'qris', true), null); // sudah aktif → tanpa perubahan
  const twoOnline = METHODS.map((m) => (m.method_code === 'gopay' ? { ...m, is_active: true } : m));
  assert.equal(paymentMethodToggleError(twoOnline, 'qris', false), null);
});

test('L1 jam: hari tutup SELALU jam null di respons, walau data lama masih menyimpan jam (baris tidak diubah)', () => {
  const legacy = Object.freeze({
    hourId: 7, dayOfWeek: 7, openTime: new Date('1970-01-01T07:00:00.000Z'), closeTime: new Date('1970-01-01T20:00:00.000Z'), isOpen: false,
  });
  assert.deepEqual(toOperatingHourView(legacy), { hour_id: 7, day_of_week: 7, open_time: null, close_time: null, is_open: false });
  assert.equal(legacy.openTime.toISOString(), '1970-01-01T07:00:00.000Z'); // baris sumber tidak disentuh
  // Hari buka tanpa jam (data tidak lengkap) tetap null — tidak diisi default di server
  assert.deepEqual(toOperatingHourView({ hourId: 2, dayOfWeek: 2, openTime: null, closeTime: null, isOpen: true }), {
    hour_id: 2, day_of_week: 2, open_time: null, close_time: null, is_open: true,
  });
});

test('pemetaan respons: hanya field kontrak mock (tanpa koordinat, loyalty, batas bayar, bonus ulasan)', () => {
  const row = {
    settingId: 1, storeName: 'Oven & Co.', address: 'Jl. 1', latitude: '-6.2000000', longitude: '106.8000000', whatsappNumber: '+620000000000',
    preorderCutoffTime: new Date('1970-01-01T17:00:00.000Z'), deliveryRadiusKm: '10.00', deliveryFeePerKm: '2500.00',
    paymentTimeoutMinutes: 30, earnAmountPerPoint: '1000.00', reviewBonusPoints: 20,
  };
  assert.deepEqual(toStoreProfile(row), {
    store_name: 'Oven & Co.', address: 'Jl. 1', whatsapp_number: '+620000000000', preorder_cutoff_time: '17:00',
    delivery_radius_km: 10, delivery_fee_per_km: 2500,
  });
  assert.deepEqual(toStoreProfile({ storeName: 'X', address: null, whatsappNumber: null, preorderCutoffTime: null, deliveryRadiusKm: null, deliveryFeePerKm: null }), {
    store_name: 'X', address: null, whatsapp_number: null, preorder_cutoff_time: null, delivery_radius_km: null, delivery_fee_per_km: null,
  });
  assert.deepEqual(toOperatingHourView({ hourId: 7, dayOfWeek: 7, openTime: null, closeTime: null, isOpen: false }), {
    hour_id: 7, day_of_week: 7, open_time: null, close_time: null, is_open: false,
  });
  assert.deepEqual(toOperatingHourView({ hourId: 1, dayOfWeek: 1, openTime: new Date('1970-01-01T07:00:00.000Z'), closeTime: new Date('1970-01-01T20:00:00.000Z'), isOpen: true }), {
    hour_id: 1, day_of_week: 1, open_time: '07:00', close_time: '20:00', is_open: true,
  });
  assert.deepEqual(toPaymentMethodView({ methodCode: 'qris', name: 'QRIS', methodGroup: 'qris', isActive: true, extra: 1 }), {
    method_code: 'qris', name: 'QRIS', method_group: 'qris', is_active: true,
  });
});

const rejects = (fn, message) => assert.throws(fn, (e) => e.statusCode === 400 && e.message === message && !e.fieldErrors);

test('validator profil: teks/angka diterima, field di luar kontrak dibuang, bentuk salah → 400 tanpa fieldErrors', () => {
  const out = validateStoreProfileBody({ ...FORM, delivery_radius_km: 10, latitude: 1, longitude: 2, payment_timeout_minutes: 5, review_bonus_points: 99 });
  assert.deepEqual(Object.keys(out).sort(), Object.keys(FORM).sort());
  assert.deepEqual(validateStoreProfileBody(undefined), {});
  rejects(() => validateStoreProfileBody({ ...FORM, store_name: 5 }), T.BODY_INVALID_TEXT);
  rejects(() => validateStoreProfileBody({ ...FORM, delivery_fee_per_km: true }), T.BODY_INVALID_TEXT);
  rejects(() => validateStoreProfileBody([]), T.BODY_INVALID_TEXT);
});

test('validator jam: tepat 7 hari unik 1–7, is_open boolean, jam teks/null', () => {
  assert.equal(validateOperatingHoursBody({ hours: week({ 3: { is_open: false, open_time: null, close_time: null } }) }).length, 7);
  rejects(() => validateOperatingHoursBody({}), T.HOURS_DAYS_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: week().slice(0, 6) }), T.HOURS_DAYS_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: [...week(), week()[0]] }), T.HOURS_DAYS_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: week({ 7: { day_of_week: 1 } }) }), T.HOURS_DAYS_TEXT); // hari ganda
  rejects(() => validateOperatingHoursBody({ hours: week({ 7: { day_of_week: 8 } }) }), T.HOURS_DAYS_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: week({ 7: { day_of_week: '7' } }) }), T.HOURS_DAYS_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: week({ 2: { is_open: 'true' } }) }), T.BODY_INVALID_TEXT);
  rejects(() => validateOperatingHoursBody({ hours: week({ 2: { open_time: 700 } }) }), T.BODY_INVALID_TEXT);
});

test('validator kode metode, status aktif, akun staf, ID akun', () => {
  assert.equal(validatePaymentMethodCode('pay_at_store'), 'pay_at_store');
  for (const bad of ['QRIS', 'va-bca', 'a'.repeat(21), '', 'qris;drop']) rejects(() => validatePaymentMethodCode(bad), T.METHOD_CODE_TEXT);
  assert.equal(validateActiveBody({ is_active: false }), false);
  rejects(() => validateActiveBody({ is_active: 'false' }), T.ACTIVE_TEXT);
  rejects(() => validateActiveBody({}), T.ACTIVE_TEXT);
  assert.deepEqual(validateStaffBody({ name: 'A', email: 'a@b.co', phone: '+62', password: 'x', role: 'staf', is_active: false, user_id: 9 }), {
    name: 'A', email: 'a@b.co', phone: '+62', password: 'x', role: 'staf',
  });
  rejects(() => validateStaffBody({ password: 12345678 }), T.BODY_INVALID_TEXT);
  assert.equal(validateStaffId('12'), '12');
  assert.throws(() => validateStaffId('0'), (e) => e.statusCode === 400 && e.apiCode === 'INVALID_ID');
});
