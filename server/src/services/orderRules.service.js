// services/orderRules.service.js
// FR-14 – FR-16 · BR-06 · BR-07 · BR-09 — nomor pesanan, kode bayar simulasi, kode pickup, batas bayar (fungsi murni)
// Port server dari client/src/utils/rules/order.js, utils/rules/loyalty.js (pointsEarnedFor), dan
// services/mock/orderEffects.js (paymentCodeFor, randomDigits). Angka acak memakai crypto.randomInt (bukan
// Math.random) dan bisa diganti lewat parameter `randomInt` agar dapat dites.

const crypto = require('crypto');
const {
  ORDER_NUMBER_PREFIX,
  PAYMENT_GROUP,
  PAYMENT_CODE_PREFIX,
  PAYMENT_CODE_DIGITS,
  GATEWAY_REF_PREFIX,
  PICKUP_CODE_PREFIX,
  PICKUP_CODE_DIGITS,
} = require('../utils/businessConstants');
const { getOperatingHoursFor, getClosingDateTime } = require('./operatingHours.service');

/** Nomor pesanan OVC-YYMMDD-NNN dari kunci tanggal WIB */
function formatOrderNumber(dateKey, seq) {
  const [y, m, d] = dateKey.split('-');
  return `${ORDER_NUMBER_PREFIX}-${y.slice(2)}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/** Nomor urut berikutnya untuk tanggal tertentu dari nomor pesanan yang sudah ada (sama dengan client) */
function nextOrderNumber(existingNumbers, dateKey) {
  const prefix = formatOrderNumber(dateKey, 0).slice(0, -3);
  const maxSeq = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .reduce((max, n) => Math.max(max, Number(n.slice(prefix.length)) || 0), 0);
  return formatOrderNumber(dateKey, maxSeq + 1);
}

/** n digit acak */
function randomDigits(n, randomInt = crypto.randomInt) {
  return Array.from({ length: n }, () => randomInt(10)).join('');
}

/** Kode bayar simulasi per kelompok metode (payments.payment_code); Bayar di Toko tanpa kode */
function paymentCodeFor(method, orderNumber, randomInt = crypto.randomInt) {
  const group = method.method_group;
  if (group === PAYMENT_GROUP.STORE) return null;
  if (group === PAYMENT_GROUP.QRIS) return `${PAYMENT_CODE_PREFIX[group]}${orderNumber}`;
  const digits = PAYMENT_CODE_DIGITS[group] ?? PAYMENT_CODE_DIGITS[PAYMENT_GROUP.EWALLET];
  const prefix = PAYMENT_CODE_PREFIX[group] ?? PAYMENT_CODE_PREFIX[PAYMENT_GROUP.EWALLET];
  return `${prefix}${randomDigits(digits, randomInt)}`;
}

/** payments.gateway_ref simulasi; Bayar di Toko tanpa gateway */
function gatewayRefFor(method, orderNumber) {
  return method.method_group === PAYMENT_GROUP.STORE ? null : `${GATEWAY_REF_PREFIX}${orderNumber}`;
}

/** orders.pickup_code — hanya pesanan pickup */
function generatePickupCode(randomInt = crypto.randomInt) {
  return `${PICKUP_CODE_PREFIX}${randomDigits(PICKUP_CODE_DIGITS, randomInt)}`;
}

/**
 * payments.expired_at:
 *   - online       : saat pesanan dibuat + payment_timeout_minutes (BR-06)
 *   - Bayar di Toko: jam tutup toko pada tanggal siap, WIB (BR-07; operating_hours.close_time hari itu)
 * Mengganti metode TIDAK memanggil ini lagi — expired_at awal dipertahankan.
 * @returns {Date|null} null hanya untuk Bayar di Toko pada hari tutup / tanpa jam tutup (pemanggil wajib menolak)
 */
function getPaymentDeadline({ payAtStore, now, settings, operatingHours, readyDate }) {
  if (payAtStore) return getClosingDateTime(getOperatingHoursFor(operatingHours, readyDate), readyDate);
  return new Date(now.getTime() + Number(settings.payment_timeout_minutes) * 60000);
}

/** Sisa detik pembayaran (BR-06); 0 bila sudah lewat */
function getPaymentSecondsLeft(expiredAt, now) {
  return Math.max(0, Math.floor((new Date(expiredAt).getTime() - now.getTime()) / 1000));
}

/** BR-09: poin yang akan diperoleh setelah Selesai — 1 poin per earn_amount_per_point rupiah */
function pointsEarnedFor(total, settings) {
  return Math.floor(total / Number(settings.earn_amount_per_point));
}

module.exports = {
  formatOrderNumber,
  nextOrderNumber,
  randomDigits,
  paymentCodeFor,
  gatewayRefFor,
  generatePickupCode,
  getPaymentDeadline,
  getPaymentSecondsLeft,
  pointsEarnedFor,
};
