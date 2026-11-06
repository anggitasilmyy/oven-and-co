// services/payment.service.js
// FR-14 · FR-15 · BR-05 · BR-06 · C-15 — pembayaran pesanan pelanggan: simulasi lunas & ganti metode.
// Port server dari client/src/services/orderService.js (simulatePaymentPaid, changePaymentMethod).
// SIMULASI prototype (SPEC §10) — tidak ada payment gateway sungguhan; nominal & status tidak pernah dari klien.
// Mock membatalkan pesanan kedaluwarsa setiap kali dibaca; di server job autoCancelOrders (Step 6.5 C2) membatalkannya
// tiap menit, dan pembayaran yang batas waktunya sudah lewat (`expired_at < now`) DITOLAK di sini sejak awal (tidak
// dianggap lunas, tidak diganti metode) — syarat yang sama dengan autoCancelRules.isOverdueOnlinePayment.
// Step 6.5 C1: perubahan status dicatat lewat recordOrderStatus (riwayat + notifikasi, transaksi yang sama); salinan
// email dicetak setelah commit (emailAfterCommit).

const prisma = require('../lib/prisma');
const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS, PAY_AT_STORE_METHOD, PAY_AT_STORE_DISABLED_TEXT,
  PAYMENT_METHOD_UNAVAILABLE_TEXT,
} = require('../utils/businessConstants');
const { isPayAtStoreAllowed, resolvePaymentMethod, PAYMENT_METHOD_ERROR } = require('./checkoutRules.service');
const { paymentCodeFor, gatewayRefFor } = require('./orderRules.service');
const { mapPaymentMethod } = require('./checkout.service');
const { lockMyOrder } = require('./order.service');
const { recordOrderStatus, emailAfterCommit } = require('./orderStatusRecorder.service');

const MESSAGES = Object.freeze({
  DEV_ONLY: 'Simulasi hanya tersedia di mode development',
  NOT_PENDING: 'Pesanan tidak lagi menunggu pembayaran.',
  EXPIRED: 'Batas waktu pembayaran sudah lewat.',
  METHOD: 'Pilih metode pembayaran.',
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Kunci baris pesanan (pembacaan pertama transaksi) lalu baca: dua request (klik ganda, tab lain, simulasi + ganti
 * metode, pembatalan) diproses berurutan dan yang kedua melihat status terbaru.
 */
async function lockPendingOrder(tx, userId, orderNumber, now) {
  const order = await lockMyOrder(tx, userId, orderNumber);
  const payment = order.payments[0] ?? null;

  if (
    order.orderStatus !== ORDER_STATUS.MENUNGGU_PEMBAYARAN ||
    order.paymentStatus !== PAYMENT_STATUS.UNPAID ||
    payment?.status !== PAYMENT_TRANSACTION_STATUS.PENDING
  ) {
    throw httpError(409, MESSAGES.NOT_PENDING);
  }
  if (new Date(payment.expiredAt).getTime() < now.getTime()) throw httpError(409, MESSAGES.EXPIRED);

  return { order, payment };
}

/** POST /api/payments/:orderNumber/simulate-paid — webhook "lunas" simulasi: Lunas → Dikonfirmasi (SPEC §4) */
async function simulatePaid(userId, orderNumber, now = new Date()) {
  if (process.env.NODE_ENV === 'production') throw httpError(403, MESSAGES.DEV_ONLY);

  return emailAfterCommit(prisma.$transaction(async (tx) => {
    const { order, payment } = await lockPendingOrder(tx, userId, orderNumber, now);

    await tx.payment.update({
      where: { paymentId: payment.paymentId },
      data: { status: PAYMENT_TRANSACTION_STATUS.PAID, paidAt: now },
    });
    await tx.order.update({
      where: { orderId: order.orderId },
      data: { paymentStatus: PAYMENT_STATUS.PAID, orderStatus: ORDER_STATUS.DIKONFIRMASI },
    });
    // Webhook payment gateway = sistem (changed_by kosong). INSERT notifikasi (FK users → kunci S baris pelanggan)
    // diambil SETELAH kunci orders — pola yang sama dengan pembatalan pelanggan (orders X → users S).
    const notice = await recordOrderStatus(tx, order, ORDER_STATUS.DIKONFIRMASI, { changedBy: null, now });

    return { result: { order_number: orderNumber }, notices: [notice] };
  }));
}

/**
 * T2 (ROADMAP 6.4.10): kunci baris metode tujuan (FOR SHARE = locking read → melihat commit terbaru) lalu pastikan masih
 * aktif. Kunci S ini menahan AD-11 menonaktifkan metode yang sama sampai transaksi ini selesai; mode kunci yang sama
 * memang diambil pemeriksaan FK saat payments.method_code diubah — hanya diambil lebih awal, SEBELUM menulis pembayaran.
 */
async function lockActiveMethod(tx, methodCode) {
  const rows = await tx.$queryRaw`SELECT method_code, is_active FROM payment_methods WHERE method_code = ${methodCode} FOR SHARE`;
  if (rows.length === 0 || !rows[0].is_active) throw httpError(409, PAYMENT_METHOD_UNAVAILABLE_TEXT);
}

/**
 * PATCH /api/orders/:orderNumber/payment — ganti metode selama Menunggu Pembayaran.
 * Bayar di Toko (BR-05: pickup + semua item ready) → pesanan langsung Dikonfirmasi. expired_at awal dipertahankan
 * (orderRules.getPaymentDeadline: mengganti metode tidak menghitung batas baru).
 */
async function changePaymentMethod(userId, orderNumber, methodCode, now = new Date()) {
  const methodRows = await prisma.paymentMethod.findMany({ where: { isActive: true } });

  return emailAfterCommit(prisma.$transaction(async (tx) => {
    const { order, payment } = await lockPendingOrder(tx, userId, orderNumber, now);
    const payAtStoreAllowed = isPayAtStoreAllowed(
      order.fulfillmentType,
      order.items.map((item) => item.product.availabilityType)
    );
    const { method, error } = resolvePaymentMethod(methodRows.map(mapPaymentMethod), methodCode, { payAtStoreAllowed });
    if (error === PAYMENT_METHOD_ERROR.PAY_AT_STORE_NOT_ALLOWED) throw httpError(400, PAY_AT_STORE_DISABLED_TEXT);
    if (!method) throw httpError(400, MESSAGES.METHOD);

    const payAtStore = method.method_code === PAY_AT_STORE_METHOD;
    // Urutan kunci (T2): pesanan X → [Bayar di Toko: riwayat — kunci S baris pelanggan lewat FK] → metode S → pembayaran.
    // Riwayat & notifikasi (C1) ditulis SEBELUM kunci metode: selama memegang kunci metode transaksi ini tidak lagi menunggu baris pelanggan,
    // sehingga tidak ada siklus dengan checkout pelanggan yang sama (pelanggan X → store_settings) dan AD-11
    // (store_settings X → metode X). Metode nonaktif → 409 dan semua tulisan di atas di-rollback.
    const notices = [];
    if (payAtStore) {
      await tx.order.update({
        where: { orderId: order.orderId },
        data: { paymentOption: PAYMENT_OPTION.PAY_AT_STORE, orderStatus: ORDER_STATUS.DIKONFIRMASI },
      });
      notices.push(await recordOrderStatus(tx, order, ORDER_STATUS.DIKONFIRMASI, { changedBy: userId, now }));
    }

    await lockActiveMethod(tx, method.method_code);
    await tx.payment.update({
      where: { paymentId: payment.paymentId },
      data: {
        methodCode: method.method_code,
        paymentCode: paymentCodeFor(method, orderNumber),
        gatewayRef: gatewayRefFor(method, orderNumber),
      },
    });

    return {
      result: { order_number: orderNumber, payment_option: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE },
      notices,
    };
  }));
}

module.exports = {
  MESSAGES,
  simulatePaid,
  changePaymentMethod,
};
