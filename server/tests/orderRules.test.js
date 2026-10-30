// Nomor pesanan, kode bayar, kode pickup, batas bayar, slot waktu (orderRules & operatingHours) — Phase 2 · Tahap 1

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatOrderNumber,
  nextOrderNumber,
  paymentCodeFor,
  gatewayRefFor,
  generatePickupCode,
  getPaymentDeadline,
  getPaymentSecondsLeft,
  pointsEarnedFor,
} = require('../src/services/orderRules.service');
const {
  dayOfWeekOf,
  getOperatingHoursFor,
  getTimeSlotOptions,
  findSelectableSlot,
  getClosingDateTime,
} = require('../src/services/operatingHours.service');
const { TIME_SLOTS } = require('../src/utils/businessConstants');

// randomInt palsu: selalu 7 → digit dapat ditebak
const seven = () => 7;

test('nomor pesanan OVC-YYMMDD-NNN dan urutan per tanggal', () => {
  assert.equal(formatOrderNumber('2026-10-12', 18), 'OVC-261012-018');
  assert.equal(nextOrderNumber([], '2026-10-23'), 'OVC-261023-001');
  assert.equal(
    nextOrderNumber(['OVC-261023-001', 'OVC-261023-009', 'OVC-261022-050'], '2026-10-23'),
    'OVC-261023-010'
  );
  assert.ok(nextOrderNumber(['OVC-261023-001'], '2026-10-23').length <= 20, 'muat di orders.order_number VARCHAR(20)');
});

test('kode bayar simulasi per kelompok metode; Bayar di Toko tanpa kode & gateway', () => {
  assert.equal(paymentCodeFor({ method_group: 'qris' }, 'OVC-261023-001', seven), 'QRIS-SIM-OVC-261023-001');
  assert.equal(paymentCodeFor({ method_group: 'va' }, 'OVC-261023-001', seven), '88087777777777');
  assert.equal(paymentCodeFor({ method_group: 'ewallet' }, 'OVC-261023-001', seven), 'EW77777777');
  assert.equal(paymentCodeFor({ method_group: 'store' }, 'OVC-261023-001', seven), null);
  assert.equal(gatewayRefFor({ method_group: 'va' }, 'OVC-261023-001'), 'SIM-OVC-261023-001');
  assert.equal(gatewayRefFor({ method_group: 'store' }, 'OVC-261023-001'), null);
  // angka acak sungguhan tetap hanya digit
  assert.match(paymentCodeFor({ method_group: 'va' }, 'X'), /^8808\d{10}$/);
});

test('kode pickup PK + 4 digit (muat di VARCHAR(10))', () => {
  assert.equal(generatePickupCode(seven), 'PK7777');
  assert.match(generatePickupCode(), /^PK\d{4}$/);
});

test('hari operasional: 1 Senin – 7 Minggu dari kunci tanggal', () => {
  assert.equal(dayOfWeekOf('2026-10-19'), 1);
  assert.equal(dayOfWeekOf('2026-10-23'), 5);
  assert.equal(dayOfWeekOf('2026-10-25'), 7);
});

test('getOperatingHoursFor: baris hari itu, atau default TF-10 bila tidak terdaftar', () => {
  const hours = [{ day_of_week: 5, open_time: '08:00', close_time: '18:00', is_open: true }];
  assert.deepEqual(getOperatingHoursFor(hours, '2026-10-23'), { open_time: '08:00', close_time: '18:00', is_open: true });
  assert.deepEqual(getOperatingHoursFor([], '2026-10-23'), { open_time: '07:00', close_time: '20:00', is_open: true });
});

test('slot waktu: dalam jam operasional; hari ini slot yang sudah dimulai nonaktif (jam WIB)', () => {
  const hours = { open_time: '09:00', close_time: '17:00', is_open: true };
  // 10.30 WIB = 03.30 UTC
  const now = new Date('2026-10-23T03:30:00Z');
  const today = getTimeSlotOptions(TIME_SLOTS, '2026-10-23', now, hours);
  assert.deepEqual(today.map((s) => s.label), ['09.00–11.00', '11.00–13.00', '13.00–15.00', '15.00–17.00']);
  assert.deepEqual(today.map((s) => s.disabled), [true, false, false, false]);
  // tepat 11.00 WIB: slot 11.00 sudah dimulai
  assert.equal(findSelectableSlot(TIME_SLOTS, '2026-10-23', new Date('2026-10-23T04:00:00Z'), hours, '11.00–13.00'), null);
  // besok: semua aktif
  assert.ok(getTimeSlotOptions(TIME_SLOTS, '2026-10-24', now, hours).every((s) => !s.disabled));
  assert.equal(findSelectableSlot(TIME_SLOTS, '2026-10-24', now, hours, '09.00–11.00').label, '09.00–11.00');
  assert.equal(findSelectableSlot(TIME_SLOTS, '2026-10-24', now, hours, '07.00–09.00'), null);
});

test('slot waktu: hari tutup atau jam kosong → tanpa slot; nilai @db.Time juga diterima', () => {
  const now = new Date('2026-10-23T00:00:00Z');
  assert.deepEqual(getTimeSlotOptions(TIME_SLOTS, '2026-10-24', now, { open_time: '07:00', close_time: '20:00', is_open: false }), []);
  assert.deepEqual(getTimeSlotOptions(TIME_SLOTS, '2026-10-24', now, { open_time: null, close_time: null, is_open: true }), []);
  const dbTime = { open_time: new Date('1970-01-01T07:00:00Z'), close_time: new Date('1970-01-01T11:00:00Z'), is_open: true };
  assert.equal(getTimeSlotOptions(TIME_SLOTS, '2026-10-24', now, dbTime).length, 2);
});

test('BR-07: batas Bayar di Toko = jam tutup tanggal siap (WIB); hari tutup → null', () => {
  assert.equal(
    getClosingDateTime({ close_time: '20:00', is_open: true }, '2026-10-23').toISOString(),
    '2026-10-23T13:00:00.000Z'
  );
  assert.equal(getClosingDateTime({ close_time: '20:00', is_open: false }, '2026-10-23'), null);
  assert.equal(getClosingDateTime({ close_time: null, is_open: true }, '2026-10-23'), null);
});

test('payments.expired_at: online = now + timeout (BR-06); Bayar di Toko = jam tutup (BR-07)', () => {
  const now = new Date('2026-10-23T03:30:00Z');
  const settings = { payment_timeout_minutes: 30 };
  const operatingHours = [{ day_of_week: 5, open_time: '07:00', close_time: '19:30', is_open: true }];
  assert.equal(
    getPaymentDeadline({ payAtStore: false, now, settings, operatingHours, readyDate: '2026-10-23' }).toISOString(),
    '2026-10-23T04:00:00.000Z'
  );
  assert.equal(
    getPaymentDeadline({ payAtStore: true, now, settings, operatingHours, readyDate: '2026-10-23' }).toISOString(),
    '2026-10-23T12:30:00.000Z'
  );
  // tabel kosong → asumsi TF-10 tutup 20.00 WIB
  assert.equal(
    getPaymentDeadline({ payAtStore: true, now, settings, operatingHours: [], readyDate: '2026-10-23' }).toISOString(),
    '2026-10-23T13:00:00.000Z'
  );
});

test('sisa detik pembayaran & poin yang akan diperoleh', () => {
  const now = new Date('2026-10-23T03:30:00Z');
  assert.equal(getPaymentSecondsLeft('2026-10-23T04:00:00.000Z', now), 1800);
  assert.equal(getPaymentSecondsLeft(new Date('2026-10-23T03:00:00Z'), now), 0);
  assert.equal(pointsEarnedFor(35999, { earn_amount_per_point: 1000 }), 35);
});
