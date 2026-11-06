// services/autoCancelRules.service.js
// FR-38 · BR-06 — aturan murni pembatalan otomatis pembayaran online (Step 6.5 C2). Dipakai job autoCancelOrders untuk
// memeriksa ulang kandidat SETELAH baris pesanan dikunci. Step 6.5 C3: BR-07 (Bayar di Toko tidak diambil sampai jam
// tutup pada tanggal siap, WIB) — keputusan final memakai jam operasional TERBARU yang dibaca dengan locking read di dalam
// transaksi (lihat jobs/autoCancelOrders.js); snapshot per putaran hanya untuk preseleksi kandidat.

const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS, PICKUP_AUTO_CANCEL_STATUSES,
} = require('../utils/businessConstants');
const { getOperatingHoursFor, getClosingDateTime } = require('./operatingHours.service');
const { addDaysToDateKey } = require('../utils/jakartaDate');

/**
 * BR-06: pesanan online yang masih Menunggu Pembayaran, belum lunas, pembayaran terbarunya masih `pending`, dan batas
 * bayarnya SUDAH LEWAT. Batas ketat (`expired_at < now`) = komplemen syarat payment.service (pembayaran ditolak bila
 * `expired_at < now`), sehingga pada detik yang sama tidak mungkin pembayaran ditolak sekaligus job tidak membatalkan.
 * @param {{orderStatus, paymentOption, paymentStatus}} order — baris orders (Prisma)
 * @param {{status, expiredAt}|null|undefined} payment — baris payments terbaru
 * @param {Date} now
 */
function isOverdueOnlinePayment(order, payment, now) {
  if (!order || !payment) return false;
  return order.orderStatus === ORDER_STATUS.MENUNGGU_PEMBAYARAN
    && order.paymentOption === PAYMENT_OPTION.ONLINE
    && order.paymentStatus === PAYMENT_STATUS.UNPAID
    && payment.status === PAYMENT_TRANSACTION_STATUS.PENDING
    && new Date(payment.expiredAt).getTime() < now.getTime();
}

/**
 * BR-07: batas pengambilan pesanan Bayar di Toko = jam tutup toko pada tanggal siap (WIB, operating_hours).
 * H1: hari tutup / close_time kosong → akhir tanggal siap, direpresentasikan sebagai 00.00.00 WIB hari BERIKUTNYA
 * (eksklusif — tanpa masalah presisi milidetik 23.59.59).
 * @param {string} readyDateKey — "YYYY-MM-DD"
 * @param {Array<{day_of_week, open_time, close_time, is_open}>} hours — baris operating_hours (bentuk mapOperatingHour)
 * @returns {{at: Date, exclusive: boolean, fallback: boolean}} exclusive=true → lewat bila now >= at; selain itu now > at
 */
function getPickupDeadline(readyDateKey, hours) {
  const close = getClosingDateTime(getOperatingHoursFor(hours, readyDateKey), readyDateKey);
  if (close) return { at: close, exclusive: false, fallback: false };
  return { at: new Date(`${addDaysToDateKey(readyDateKey, 1)}T00:00:00+07:00`), exclusive: true, fallback: true };
}

/** Batas pengambilan sudah lewat pada `now`? (jam tutup: ketat `now > jam tutup`; fallback H1: `now >= 00.00 berikutnya`) */
function isPickupDeadlinePassed(deadline, now) {
  return deadline.exclusive ? now.getTime() >= deadline.at.getTime() : now.getTime() > deadline.at.getTime();
}

/**
 * BR-07 bagian status (tanpa jam): Bayar di Toko, belum lunas, pembayaran `pending`, dan status belum diambil
 * (Dikonfirmasi / Sedang Disiapkan / Siap Diambil — keputusan D1). Diperiksa SEBELUM kunci users & jam diambil.
 */
function isUnpaidPayAtStorePending(order, payment) {
  if (!order || !payment) return false;
  return order.paymentOption === PAYMENT_OPTION.PAY_AT_STORE
    && order.paymentStatus === PAYMENT_STATUS.UNPAID
    && payment.status === PAYMENT_TRANSACTION_STATUS.PENDING
    && PICKUP_AUTO_CANCEL_STATUSES.includes(order.orderStatus);
}

/**
 * BR-07 lengkap: syarat status + batas pengambilan pada tanggal siap sudah lewat.
 * @param {{orderStatus, paymentOption, paymentStatus}} order
 * @param {{status}|null} payment
 * @param {string} readyDateKey
 * @param {Array} hours — jam operasional TERBARU (dibaca dengan kunci di transaksi)
 * @param {Date} now
 */
function isPastPickupClose(order, payment, readyDateKey, hours, now) {
  return isUnpaidPayAtStorePending(order, payment) && isPickupDeadlinePassed(getPickupDeadline(readyDateKey, hours), now);
}

module.exports = {
  isOverdueOnlinePayment,
  getPickupDeadline,
  isPickupDeadlinePassed,
  isUnpaidPayAtStorePending,
  isPastPickupClose,
};
