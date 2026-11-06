// Step 6.5 C2 · FR-38 · BR-06 — services/autoCancelRules.service.js isOverdueOnlinePayment (fungsi murni).
// Batas ketat: tepat pada expired_at BELUM dibatalkan (pembayaran masih diterima payment.service pada detik itu).

const test = require('node:test');
const assert = require('node:assert/strict');
const { isOverdueOnlinePayment } = require('../src/services/autoCancelRules.service');

const EXPIRED_AT = new Date('2026-10-20T01:30:00.000Z');
const order = (overrides = {}) => ({
  orderStatus: 'menunggu_pembayaran', paymentOption: 'online', paymentStatus: 'unpaid', ...overrides,
});
const payment = (overrides = {}) => ({ status: 'pending', expiredAt: EXPIRED_AT, ...overrides });
const at = (ms) => new Date(EXPIRED_AT.getTime() + ms);

test('batas waktu: sebelum & tepat expired_at → tidak; sesudah (1 ms / 1 s) → ya', () => {
  assert.equal(isOverdueOnlinePayment(order(), payment(), at(-1000)), false);
  assert.equal(isOverdueOnlinePayment(order(), payment(), at(0)), false);
  assert.equal(isOverdueOnlinePayment(order(), payment(), at(1)), true);
  assert.equal(isOverdueOnlinePayment(order(), payment(), at(1000)), true);
  // expired_at sebagai string ISO (bentuk serialisasi) dinilai sama
  assert.equal(isOverdueOnlinePayment(order(), payment({ expiredAt: EXPIRED_AT.toISOString() }), at(1000)), true);
});

test('pesanan / pembayaran yang tidak memenuhi BR-06 tidak pernah dibatalkan walau lewat batas', () => {
  const late = at(60000);
  const cases = [
    ['sudah lunas (orders)', order({ paymentStatus: 'paid' }), payment()],
    ['pembayaran paid', order(), payment({ status: 'paid' })],
    ['pembayaran expired (sudah dibatalkan job)', order(), payment({ status: 'expired' })],
    ['pembayaran failed (dibatalkan pelanggan)', order(), payment({ status: 'failed' })],
    ['sudah Dibatalkan', order({ orderStatus: 'dibatalkan' }), payment()],
    ['sudah Dikonfirmasi', order({ orderStatus: 'dikonfirmasi' }), payment()],
    ['Bayar di Toko (BR-07, C3)', order({ paymentOption: 'pay_at_store' }), payment()],
    ['tanpa pembayaran', order(), null],
  ];
  for (const [label, o, p] of cases) assert.equal(isOverdueOnlinePayment(o, p, late), false, label);
  assert.equal(isOverdueOnlinePayment(null, payment(), late), false);
});

// ── Step 6.5 C3 · BR-07 ──────────────────────────────────────────────────────────────────────────

const {
  getPickupDeadline, isPickupDeadlinePassed, isUnpaidPayAtStorePending, isPastPickupClose,
} = require('../src/services/autoCancelRules.service');

const hour = (day, close, { open = '07:00', isOpen = true } = {}) => ({ day_of_week: day, open_time: open, close_time: close, is_open: isOpen });
const READY = '2026-11-06'; // Jumat → day_of_week 5
const wib = (dateKey, hhmmss, ms = 0) => new Date(new Date(`${dateKey}T${hhmmss}+07:00`).getTime() + ms);

test('BR-07 batas: jam tutup hari tanggal siap (WIB), ketat — sebelum & tepat tidak lewat, sesudah lewat', () => {
  const hours = [hour(5, '20:00'), hour(6, '22:00')];
  const d = getPickupDeadline(READY, hours);
  assert.deepEqual([d.at.toISOString(), d.exclusive, d.fallback], ['2026-11-06T13:00:00.000Z', false, false]);
  assert.equal(isPickupDeadlinePassed(d, wib(READY, '19:59:59')), false);
  assert.equal(isPickupDeadlinePassed(d, wib(READY, '20:00:00')), false, 'tepat jam tutup belum lewat');
  assert.equal(isPickupDeadlinePassed(d, wib(READY, '20:00:00', 1)), true);
  // Hari lain memakai jam hari itu (Sabtu 22.00)
  assert.equal(getPickupDeadline('2026-11-07', hours).at.toISOString(), '2026-11-07T15:00:00.000Z');
  // Baris hari tidak ada → asumsi TF-10 07.00–20.00
  assert.equal(getPickupDeadline('2026-11-08', hours).at.toISOString(), '2026-11-08T13:00:00.000Z');
});

test('BR-07 H1: hari tutup / close_time kosong → 00.00.00 WIB hari berikutnya (eksklusif)', () => {
  for (const hours of [[hour(5, '20:00', { isOpen: false })], [hour(5, null)]]) {
    const d = getPickupDeadline(READY, hours);
    assert.deepEqual([d.at.toISOString(), d.exclusive, d.fallback], ['2026-11-06T17:00:00.000Z', true, true]);
    assert.equal(isPickupDeadlinePassed(d, wib('2026-11-06', '23:59:59', 999)), false, '23.59.59,999 belum lewat');
    assert.equal(isPickupDeadlinePassed(d, wib('2026-11-07', '00:00:00')), true, 'tepat 00.00 hari berikutnya lewat');
  }
});

test('BR-07 batas pergantian hari WIB: 23.59 WIB hari siap = 16.59Z; jam tutup tidak bergantung zona server', () => {
  const d = getPickupDeadline(READY, [hour(5, '23:30')]);
  assert.equal(d.at.toISOString(), '2026-11-06T16:30:00.000Z');
  assert.equal(isPickupDeadlinePassed(d, new Date('2026-11-06T16:30:01Z')), true);
  assert.equal(isPickupDeadlinePassed(d, new Date('2026-11-06T16:29:59Z')), false);
});

test('BR-07 syarat status: Bayar di Toko, unpaid, payment pending, status belum diambil (D1)', () => {
  const o = (overrides = {}) => ({ paymentOption: 'pay_at_store', paymentStatus: 'unpaid', orderStatus: 'dikonfirmasi', ...overrides });
  const pending = { status: 'pending' };
  for (const status of ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil']) {
    assert.equal(isUnpaidPayAtStorePending(o({ orderStatus: status }), pending), true, status);
  }
  const no = [
    ['lunas', o({ paymentStatus: 'paid' }), pending], ['payment paid', o(), { status: 'paid' }],
    ['Selesai', o({ orderStatus: 'selesai' }), pending], ['Dibatalkan', o({ orderStatus: 'dibatalkan' }), pending],
    ['Menunggu Pembayaran', o({ orderStatus: 'menunggu_pembayaran' }), pending], ['online', o({ paymentOption: 'online' }), pending],
    ['Dalam Pengiriman', o({ orderStatus: 'dalam_pengiriman' }), pending], ['tanpa payment', o(), null],
  ];
  for (const [label, order, p] of no) assert.equal(isUnpaidPayAtStorePending(order, p), false, label);
  assert.equal(isPastPickupClose(o(), pending, READY, [hour(5, '20:00')], wib(READY, '20:00:01')), true);
  assert.equal(isPastPickupClose(o({ paymentStatus: 'paid' }), pending, READY, [hour(5, '20:00')], wib(READY, '23:00:00')), false);
  assert.equal(isPastPickupClose(o(), pending, READY, [hour(5, '20:00')], wib(READY, '20:00:00')), false);
});
