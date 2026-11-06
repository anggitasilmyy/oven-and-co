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
