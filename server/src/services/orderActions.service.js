// services/orderActions.service.js
// FR-19 · FR-20 · BR-08 · TF-09 · TF-12 · C-18 — aksi pelanggan pada pesanannya: batalkan & rencana "Pesan Lagi".
// Port server dari client/src/services/orderHistoryService.js + mock/orderCancellation.js cancelOrderInTables dan
// utils/rules/orderTracking.js planReorder, dengan aturan & pesan yang sama.
// Pembatalan: status Dibatalkan + alasan, lunas → refunded (TF-09: hanya dicatat), stok ready kembali pada tanggal
// pesanan dibuat, klaim voucher bisa dipakai lagi (kuota +1), poin yang ditukar dikembalikan (refund), riwayat status.
// Pesan Lagi hanya MENGHITUNG item untuk keranjang — tidak membuat pesanan atau pembayaran.

const prisma = require('../lib/prisma');
const {
  AVAILABILITY_TYPE, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_TRANSACTION_STATUS, POINT_TX_TYPE,
} = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { canCancelOrder } = require('./orderTracking.service');
const { findMyOrder } = require('./order.service');
const { toItemLine, findMyOrderDetailRow } = require('./myOrders.service');

const MESSAGES = Object.freeze({
  NOT_CANCELLABLE: 'Pesanan sudah disiapkan sehingga tidak bisa dibatalkan',
  ALREADY_CANCELLED: 'Pesanan ini sudah dibatalkan.',
});

// Asumsi prototype (client constants/orderHistory.js UNPAID_CANCEL_PAYMENT_STATUS): enum payments.status tidak punya
// "cancelled" → pembayaran yang belum terjadi dicatat "failed"; yang sudah lunas "refunded" (BR-08)
const UNPAID_CANCEL_PAYMENT_STATUS = PAYMENT_TRANSACTION_STATUS.FAILED;

// Alasan dilewati "Pesan Lagi" (client constants/orderHistory.js REORDER_SKIP_REASON)
const REORDER_SKIP_REASON = Object.freeze({
  UNAVAILABLE: 'tidak tersedia lagi',
  CUSTOM: 'custom cake perlu didesain ulang',
  SOLD_OUT: 'stok hari ini habis',
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Stok ready dikembalikan pada tanggal pesanan dibuat (TF-12); tidak pernah di bawah 0 */
async function returnReadyStock(tx, order) {
  const totals = new Map();
  order.items
    .filter((item) => item.product.availabilityType === AVAILABILITY_TYPE.READY)
    .forEach((item) => totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity));
  const stockDate = dateKeyToDbDate(getJakartaDateKey(order.createdAt));

  for (const [productId, quantity] of [...totals.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    await tx.$executeRaw`UPDATE daily_stocks SET qty_sold = GREATEST(qty_sold - ${quantity}, 0)
      WHERE product_id = ${productId} AND stock_date = ${stockDate}`;
  }
}

/**
 * PATCH /api/orders/:orderNumber/cancel — BR-08: hanya sebelum Sedang Disiapkan.
 * Pesanan dikunci lalu dibaca ulang: klik ganda / tab lain tidak mengembalikan stok, voucher, atau poin dua kali.
 */
async function cancelMyOrder(userId, orderNumber, reason, now = new Date()) {
  const owner = BigInt(userId);

  return prisma.$transaction(async (tx) => {
    const owned = await findMyOrder(tx, userId, orderNumber);
    await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id = ${owned.orderId} FOR UPDATE`;
    const order = await findMyOrder(tx, userId, orderNumber);

    if (order.orderStatus === ORDER_STATUS.DIBATALKAN) throw httpError(409, MESSAGES.ALREADY_CANCELLED);
    if (!canCancelOrder({ order_status: order.orderStatus })) throw httpError(409, MESSAGES.NOT_CANCELLABLE);

    const paid = order.paymentStatus === PAYMENT_STATUS.PAID;
    await tx.order.update({
      where: { orderId: order.orderId },
      data: {
        orderStatus: ORDER_STATUS.DIBATALKAN,
        cancelReason: reason,
        paymentStatus: paid ? PAYMENT_STATUS.REFUNDED : order.paymentStatus,
      },
    });
    await tx.payment.updateMany({
      where: { orderId: order.orderId },
      data: { status: paid ? PAYMENT_TRANSACTION_STATUS.REFUNDED : UNPAID_CANCEL_PAYMENT_STATUS },
    });
    await returnReadyStock(tx, order);

    if (order.voucherId != null) {
      await tx.userVoucher.updateMany({
        where: { userId: owner, voucherId: order.voucherId },
        data: { usedAt: null },
      });
      await tx.voucher.update({ where: { voucherId: order.voucherId }, data: { quota: { increment: 1 } } });
    }
    if (order.pointsUsed > 0) {
      await tx.pointTransaction.create({
        data: { userId: owner, type: POINT_TX_TYPE.REFUND, points: order.pointsUsed, orderId: order.orderId, createdAt: now },
      });
    }
    await tx.orderStatusHistory.create({
      data: { orderId: order.orderId, status: ORDER_STATUS.DIBATALKAN, changedBy: owner, note: reason, changedAt: now },
    });

    return { order_number: orderNumber };
  });
}

/**
 * Rencana "Pesan Lagi" (planReorder): item yang masih tersedia; custom cake dilewati (desain sekali pakai);
 * produk ready dibatasi sisa stok hari ini dikurangi jumlah produk yang sama di keranjang; pre-order tanggal tercepat.
 * @param {Array<object>} lines — toItemLine
 * @param {Array<{product_id, design_id, quantity}>} cartItems — keranjang saat ini (validators/cart.validator.js)
 */
function planReorder(lines, cartItems = []) {
  const used = new Map();
  cartItems.filter((i) => !i.design_id).forEach((i) => used.set(i.product_id, (used.get(i.product_id) ?? 0) + i.quantity));
  const items = [];
  const skipped = [];

  for (const line of lines) {
    if (!line.available) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.UNAVAILABLE }); continue; }
    if (line.availability_type === AVAILABILITY_TYPE.CUSTOM) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.CUSTOM }); continue; }
    let quantity = line.quantity;
    if (line.availability_type === AVAILABILITY_TYPE.READY) {
      quantity = Math.min(quantity, (line.remaining_today ?? 0) - (used.get(line.product_id) ?? 0));
      if (quantity <= 0) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.SOLD_OUT }); continue; }
      used.set(line.product_id, (used.get(line.product_id) ?? 0) + quantity);
    }
    items.push({
      product_id: line.product_id, variant_id: line.variant_id ?? null, design_id: null, quantity,
      note: line.note ?? '', preferred_date: null, name: line.name, price: line.unit_price, image_url: line.image_url,
    });
  }

  return { items, skipped };
}

/** POST /api/orders/:orderNumber/reorder — hanya membaca; tidak membuat pesanan/pembayaran */
async function getReorderPlan(userId, orderNumber, cartItems, now = new Date()) {
  const row = await findMyOrderDetailRow(prisma, userId, orderNumber, now);
  return planReorder(row.items.map(toItemLine), cartItems);
}

module.exports = {
  MESSAGES,
  REORDER_SKIP_REASON,
  planReorder,
  cancelMyOrder,
  getReorderPlan,
};
