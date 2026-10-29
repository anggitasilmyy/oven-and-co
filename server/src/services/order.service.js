// services/order.service.js
// FR-14 – FR-16 · BR-05 · BR-06 · C-15 Bayar · C-16 Pesanan Berhasil — data halaman pembayaran pesanan pelanggan.
// Bentuk sama dengan client services/orderService.js toPaymentView. Hanya pesanan milik pelanggan login
// (pesanan orang lain = tidak ditemukan). Membaca TIDAK mengubah status: pembatalan otomatis BR-06/BR-07 adalah
// job autoCancelOrders (Step 6.5).

const prisma = require('../lib/prisma');
const { isPayAtStoreAllowed } = require('./checkoutRules.service');
const { getPaymentSecondsLeft, pointsEarnedFor } = require('./orderRules.service');
const { mapStoreSetting, mapPaymentMethod } = require('./checkout.service');
const { mapOrder, mapPayment } = require('./orderView.service');

const NOT_FOUND_MESSAGE = 'Pesanan tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Pesanan milik pelanggan + pembayaran terbaru + tipe produk item; 404 bila bukan miliknya */
async function findMyOrder(client, userId, orderNumber) {
  const order = await client.order.findFirst({
    where: { orderNumber, userId: BigInt(userId) },
    include: {
      payments: { orderBy: { paymentId: 'desc' }, take: 1, include: { method: true } },
      items: { select: { productId: true, quantity: true, product: { select: { availabilityType: true } } } },
    },
  });

  if (!order) throw httpError(404, NOT_FOUND_MESSAGE);
  return order;
}

/** GET /api/orders/:orderNumber/payment */
async function getOrderPayment(userId, orderNumber, now = new Date()) {
  const [order, storeRow] = await Promise.all([
    findMyOrder(prisma, userId, orderNumber),
    prisma.storeSetting.findFirst({ orderBy: { settingId: 'asc' } }),
  ]);

  if (!storeRow) throw httpError(500, 'Pengaturan toko belum tersedia.');

  const payment = order.payments[0] ?? null;

  return {
    order: mapOrder(order),
    payment: mapPayment(payment),
    method: payment?.method ? mapPaymentMethod(payment.method) : null,
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    seconds_left: payment ? getPaymentSecondsLeft(payment.expiredAt, now) : 0,
    points_to_earn: pointsEarnedFor(Number(order.total), mapStoreSetting(storeRow)),
    pay_at_store_allowed: isPayAtStoreAllowed(
      order.fulfillmentType,
      order.items.map((item) => item.product.availabilityType)
    ),
  };
}

/** GET /api/payment-methods — metode aktif untuk filter AD-03 (Staf/Owner), sama dengan mock adminOrderService */
async function getActivePaymentMethods() {
  const rows = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ methodGroup: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapPaymentMethod);
}

module.exports = {
  NOT_FOUND_MESSAGE,
  findMyOrder,
  getOrderPayment,
  getActivePaymentMethods,
};
