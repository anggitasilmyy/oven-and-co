// services/paymentGateway.service.js
// Step 6.5 C4 · FR-14 · NFR-05 · BR-06 — pemrosesan notifikasi "lunas" dari payment gateway sebagai FUNGSI INTERNAL.
// SPEC §10: gateway disimulasikan (tombol uji "Simulasikan Lunas", hanya development) — TIDAK ada endpoint callback HTTP
// publik. Satu-satunya pemanggil sekarang: payment.service simulatePaid (urusan pelanggan: production 403, kepemilikan).
// Callback gateway sungguhan kelak cukup mengunci pesanan (berdasarkan gateway_ref) lalu memanggil fungsi yang sama.
//
// Kontrak (keputusan W1–W3):
//   - Pemanggil WAJIB sudah mengunci baris orders (FOR UPDATE sebagai pembacaan pertama transaksi — lockMyOrder) dan
//     memuat payments terbaru beserta metode. Semua pemeriksaan dilakukan SETELAH kunci, jadi notifikasi ganda,
//     notifikasi setelah pembatalan (pelanggan / BR-06), atau setelah ganti ke Bayar di Toko tidak menulis apa pun.
//   - Hasil terstruktur, bukan HTTP: { applied: true, notices } atau { applied: false, reason } (GATEWAY_PAYMENT_REASON).
//   - Notifikasi sah bila gateway_ref = payments.gateway_ref, nominal = payments.amount (Prisma.Decimal, presisi DECIMAL —
//     bukan perbandingan float), dan metode pembayaran termasuk kelompok gateway (QRIS / e-wallet / VA).
//   - Notifikasi yang diproses setelah expired_at ditolak (EXPIRED); BR-06 tetap aturan pembatalan, tanpa refund otomatis.
// Urutan kunci (tidak berubah dari simulatePaid C1–C3): orders X (pemanggil) → UPDATE payments berdasarkan PRIMARY KEY
// (record lock saja, tanpa gap — pola F-C3-1) → UPDATE orders (baris yang sama) → INSERT riwayat & notifikasi lewat recorder
// C1 (FK users → kunci S baris pelanggan; changed_by NULL = sistem). Salinan email dicetak pemanggil SETELAH commit.

const { Prisma } = require('@prisma/client');
const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS, GATEWAY_PAYMENT_REASON, GATEWAY_PAYMENT_GROUPS,
} = require('../utils/businessConstants');
const { recordOrderStatus } = require('./orderStatusRecorder.service');

/** Nominal → Prisma.Decimal; null bila kosong / tidak valid (tidak pernah lewat Number) */
function toDecimal(value) {
  if (value == null || value === '') return null;
  try {
    const decimal = new Prisma.Decimal(value instanceof Prisma.Decimal ? value : String(value));
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

/** Nominal notifikasi = nominal pembayaran di database (DECIMAL; 56500 = 56500.00) */
function isSameAmount(notified, stored) {
  const a = toDecimal(notified);
  const b = toDecimal(stored);
  return a != null && b != null && a.equals(b);
}

/**
 * Evaluasi notifikasi terhadap pesanan & pembayaran TERKUNCI (fungsi murni).
 * Urutan: status (tidak lagi menunggu) → keabsahan notifikasi → batas waktu.
 * @param {{orderStatus, paymentStatus, paymentOption}} order
 * @param {{status, gatewayRef, amount, expiredAt, method?: {methodGroup}}|null} payment
 * @param {{gatewayRef: string|null, amount: any, now: Date}} notification
 * @returns {string|null} GATEWAY_PAYMENT_REASON atau null bila boleh diterapkan
 */
function evaluateGatewayNotification(order, payment, { gatewayRef, amount, now }) {
  if (
    !order || !payment
    || order.orderStatus !== ORDER_STATUS.MENUNGGU_PEMBAYARAN
    || order.paymentStatus !== PAYMENT_STATUS.UNPAID
    || payment.status !== PAYMENT_TRANSACTION_STATUS.PENDING
  ) {
    return GATEWAY_PAYMENT_REASON.NOT_PENDING;
  }
  if (
    order.paymentOption !== PAYMENT_OPTION.ONLINE
    || !GATEWAY_PAYMENT_GROUPS.includes(payment.method?.methodGroup)
    || !payment.gatewayRef || gatewayRef !== payment.gatewayRef
    || !isSameAmount(amount, payment.amount)
  ) {
    return GATEWAY_PAYMENT_REASON.INVALID_NOTIFICATION;
  }
  // Batas ketat sama dengan BR-06 (autoCancelRules.isOverdueOnlinePayment): tepat pada expired_at masih diterima
  if (new Date(payment.expiredAt).getTime() < now.getTime()) return GATEWAY_PAYMENT_REASON.EXPIRED;
  return null;
}

/**
 * Terapkan notifikasi "lunas" di dalam transaksi pemanggil (baris orders sudah dikunci).
 * @param {object} tx
 * @param {object} order — hasil lockMyOrder (include payments terbaru + method)
 * @param {{gatewayRef: string|null, amount: any, now: Date}} notification
 * @returns {Promise<{applied: true, notices: Array}|{applied: false, reason: string}>}
 */
async function applyGatewayPayment(tx, order, { gatewayRef, amount, now }) {
  const payment = order.payments?.[0] ?? null;
  const reason = evaluateGatewayNotification(order, payment, { gatewayRef, amount, now });
  if (reason) return { applied: false, reason };

  await tx.payment.update({
    where: { paymentId: payment.paymentId },
    data: { status: PAYMENT_TRANSACTION_STATUS.PAID, paidAt: now },
  });
  await tx.order.update({
    where: { orderId: order.orderId },
    data: { paymentStatus: PAYMENT_STATUS.PAID, orderStatus: ORDER_STATUS.DIKONFIRMASI },
  });
  // Notifikasi gateway = sistem (changed_by kosong); riwayat + notifikasi "Pesanan dikonfirmasi" di transaksi yang sama
  const notice = await recordOrderStatus(tx, order, ORDER_STATUS.DIKONFIRMASI, { changedBy: null, now });
  return { applied: true, notices: [notice] };
}

module.exports = {
  isSameAmount,
  evaluateGatewayNotification,
  applyGatewayPayment,
};
