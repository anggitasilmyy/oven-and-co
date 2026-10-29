// services/payment.service.js
// FR-14 · FR-15 · BR-05 · BR-06 · C-15 — pembayaran pesanan pelanggan: simulasi lunas & ganti metode.
// Port server dari client/src/services/orderService.js (simulatePaymentPaid, changePaymentMethod).
// SIMULASI prototype (SPEC §10) — tidak ada payment gateway sungguhan; nominal & status tidak pernah dari klien.
// Mock membatalkan pesanan kedaluwarsa setiap kali dibaca; di server job autoCancelOrders baru ada di Step 6.5,
// jadi pembayaran yang batas waktunya sudah lewat DITOLAK di sini (tidak dianggap lunas, tidak diganti metode).

const prisma = require('../lib/prisma');
const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, PAYMENT_TRANSACTION_STATUS, PAY_AT_STORE_METHOD, PAY_AT_STORE_DISABLED_TEXT,
} = require('../utils/businessConstants');
const { isPayAtStoreAllowed, resolvePaymentMethod, PAYMENT_METHOD_ERROR } = require('./checkoutRules.service');
const { paymentCodeFor, gatewayRefFor } = require('./orderRules.service');
const { mapPaymentMethod } = require('./checkout.service');
const { findMyOrder } = require('./order.service');

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
 * Kunci baris pesanan lalu baca ulang di dalam transaksi: dua request (klik ganda, tab lain, simulasi + ganti metode)
 * diproses berurutan dan yang kedua melihat status terbaru.
 */
async function lockPendingOrder(tx, userId, orderNumber, now) {
  const owned = await findMyOrder(tx, userId, orderNumber);
  await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id = ${owned.orderId} FOR UPDATE`;
  const order = await findMyOrder(tx, userId, orderNumber);
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

  return prisma.$transaction(async (tx) => {
    const { order, payment } = await lockPendingOrder(tx, userId, orderNumber, now);

    await tx.payment.update({
      where: { paymentId: payment.paymentId },
      data: { status: PAYMENT_TRANSACTION_STATUS.PAID, paidAt: now },
    });
    await tx.order.update({
      where: { orderId: order.orderId },
      data: { paymentStatus: PAYMENT_STATUS.PAID, orderStatus: ORDER_STATUS.DIKONFIRMASI },
    });
    // Webhook payment gateway = sistem (changed_by kosong)
    await tx.orderStatusHistory.create({
      data: { orderId: order.orderId, status: ORDER_STATUS.DIKONFIRMASI, changedBy: null, changedAt: now },
    });

    return { order_number: orderNumber };
  });
}

/**
 * PATCH /api/orders/:orderNumber/payment — ganti metode selama Menunggu Pembayaran.
 * Bayar di Toko (BR-05: pickup + semua item ready) → pesanan langsung Dikonfirmasi. expired_at awal dipertahankan
 * (orderRules.getPaymentDeadline: mengganti metode tidak menghitung batas baru).
 */
async function changePaymentMethod(userId, orderNumber, methodCode, now = new Date()) {
  const methodRows = await prisma.paymentMethod.findMany({ where: { isActive: true } });

  return prisma.$transaction(async (tx) => {
    const { order, payment } = await lockPendingOrder(tx, userId, orderNumber, now);
    const payAtStoreAllowed = isPayAtStoreAllowed(
      order.fulfillmentType,
      order.items.map((item) => item.product.availabilityType)
    );
    const { method, error } = resolvePaymentMethod(methodRows.map(mapPaymentMethod), methodCode, { payAtStoreAllowed });
    if (error === PAYMENT_METHOD_ERROR.PAY_AT_STORE_NOT_ALLOWED) throw httpError(400, PAY_AT_STORE_DISABLED_TEXT);
    if (!method) throw httpError(400, MESSAGES.METHOD);

    const payAtStore = method.method_code === PAY_AT_STORE_METHOD;
    await tx.payment.update({
      where: { paymentId: payment.paymentId },
      data: {
        methodCode: method.method_code,
        paymentCode: paymentCodeFor(method, orderNumber),
        gatewayRef: gatewayRefFor(method, orderNumber),
      },
    });

    if (payAtStore) {
      await tx.order.update({
        where: { orderId: order.orderId },
        data: { paymentOption: PAYMENT_OPTION.PAY_AT_STORE, orderStatus: ORDER_STATUS.DIKONFIRMASI },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.orderId, status: ORDER_STATUS.DIKONFIRMASI, changedBy: BigInt(userId), changedAt: now },
      });
    }

    return { order_number: orderNumber, payment_option: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE };
  });
}

module.exports = {
  MESSAGES,
  simulatePaid,
  changePaymentMethod,
};
