// services/autoCancelRules.service.js
// FR-38 · BR-06 — aturan murni pembatalan otomatis pembayaran online (Step 6.5 C2). Dipakai job autoCancelOrders untuk
// memeriksa ulang kandidat SETELAH baris pesanan dikunci. BR-07 (Bayar di Toko setelah jam tutup) menyusul di C3.

const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS,
} = require('../utils/businessConstants');

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

module.exports = {
  isOverdueOnlinePayment,
};
