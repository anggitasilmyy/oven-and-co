// services/orderCancellation.service.js
// FR-20 · FR-38 · BR-06 · BR-08 · TF-09 · TF-12 · SPEC §4 — efek pembatalan pesanan bersama untuk pembatalan pelanggan
// (orderActions.cancelMyOrder) dan pembatalan otomatis (jobs/autoCancelOrders.js). Port server dari client
// services/mock/orderCancellation.js cancelOrderInTables (Step 6.5 C2: diekstrak dari cancelMyOrder TANPA mengubah urutan).
// Efek: status Dibatalkan + alasan, lunas → refunded (TF-09: hanya dicatat), baris payments diberi status pembatalan,
// stok ready kembali pada tanggal pesanan dibuat, klaim voucher bisa dipakai lagi (kuota +1), poin yang ditukar
// dikembalikan (refund), riwayat + notifikasi status (dan notifikasi poin refund) lewat recorder C1.
//
// Syarat pemanggil: `order` hasil lockMyOrder (baris orders SUDAH dikunci FOR UPDATE sebagai pembacaan pertama
// transaksi, include payments & items.product.availabilityType) dan kelayakan pembatalan sudah diperiksa SETELAH kunci.

const {
  AVAILABILITY_TYPE, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_TRANSACTION_STATUS, POINT_TX_TYPE, POINTS_NOTIFICATION_REASON,
} = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { recordOrderStatus, recordPointsNotice } = require('./orderStatusRecorder.service');

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
 * Jalankan seluruh efek pembatalan di dalam `tx` (satu transaksi; gagal di mana pun → seluruhnya di-rollback).
 * @param {object} tx — klien transaksi
 * @param {object} order — baris orders terkunci (lockMyOrder)
 * @param {{reason: string, changedBy: bigint|null, unpaidPaymentStatus: string, now: Date}} opts
 *   changedBy: pelanggan (BR-08) atau null = sistem (BR-06); unpaidPaymentStatus: status baris payments bila belum
 *   lunas — `failed` (batal pelanggan) / `expired` (batas bayar lewat). Pesanan lunas selalu `refunded`.
 * @returns {Promise<Array>} notifikasi yang ditulis (salinan email dicetak pemanggil SETELAH commit)
 */
async function cancelOrderTx(tx, order, { reason, changedBy, unpaidPaymentStatus, now }) {
  const owner = order.userId;

  // Urutan kunci (Integrasi MySQL 8 C4 + Step 6.5 C1 · temuan F-C1-1):
  //   orders X (lockMyOrder) → INSERT poin refund, riwayat, notifikasi (FK users → kunci S baris pelanggan)
  //   → UPDATE orders & payments → daily_stocks X → user_vouchers / vouchers.
  // - Kelompok users S SEBELUM daily_stocks (C4): urutan lama daily_stocks X → users S deadlock dengan checkout pelanggan
  //   yang sama (users X → … → daily_stocks X).
  // - Kelompok users S juga SEBELUM payment.updateMany (F-C1-1): UPDATE … WHERE order_id memakai indeks
  //   payments_order_id_fkey dan mengambil next-key lock; bila pesanan ini entri terakhir indeks, kunci mencakup gap
  //   sampai supremum. Checkout pelanggan yang sama (users X) yang INSERT payments pesanan baru menunggu gap itu,
  //   sementara pembatalan menunggu users S → siklus (terbukti di MySQL 8, tests-mysql/12-cancel-checkout-lock-order).
  //   Kini pembatalan menunggu users SEBELUM memegang gap payments, sehingga checkout tidak pernah menunggu pembatalan.
  // - Step 6.5 C3 · temuan F-C3-1 (terbukti di MySQL 8, tests-mysql/14 Q1/Q2): gap lock itu juga membentuk siklus dengan
  //   checkout pelanggan LAIN (daily_stocks X → INSERT payments) yang tidak diserialkan kunci users. Karena itu baris
  //   payments kini diubah lewat PRIMARY KEY (kunci record saja, tanpa next-key/gap lock); urutan di atas tetap.
  // Urutan notifikasi sama dengan mock (status, lalu poin).
  if (order.pointsUsed > 0) {
    await tx.pointTransaction.create({
      data: { userId: owner, type: POINT_TX_TYPE.REFUND, points: order.pointsUsed, orderId: order.orderId, createdAt: now },
    });
  }
  const notices = [
    await recordOrderStatus(tx, order, ORDER_STATUS.DIBATALKAN, { changedBy, note: reason, now }),
  ];
  if (order.pointsUsed > 0) {
    notices.push(await recordPointsNotice(tx, {
      userId: owner, points: order.pointsUsed, reason: POINTS_NOTIFICATION_REASON.REFUND(order.orderNumber), orderId: order.orderId, now,
    }));
  }

  const paid = order.paymentStatus === PAYMENT_STATUS.PAID;
  await tx.order.update({
    where: { orderId: order.orderId },
    data: {
      orderStatus: ORDER_STATUS.DIBATALKAN,
      cancelReason: reason,
      paymentStatus: paid ? PAYMENT_STATUS.REFUNDED : order.paymentStatus,
    },
  });
  // F-C3-1: id pembayaran dibaca tanpa kunci (consistent read; payments pesanan hanya dibuat bersama pesanan, dan pesanan
  // sudah dikunci), lalu UPDATE berdasarkan PRIMARY KEY — tidak memakai indeks payments_order_id_fkey sehingga tidak ada
  // next-key/gap lock yang menahan INSERT payments pesanan baru.
  const paymentIds = (await tx.payment.findMany({ where: { orderId: order.orderId }, select: { paymentId: true } }))
    .map((row) => row.paymentId);
  if (paymentIds.length) {
    await tx.payment.updateMany({
      where: { paymentId: { in: paymentIds } },
      data: { status: paid ? PAYMENT_TRANSACTION_STATUS.REFUNDED : unpaidPaymentStatus },
    });
  }

  await returnReadyStock(tx, order);

  if (order.voucherId != null) {
    await tx.userVoucher.updateMany({
      where: { userId: owner, voucherId: order.voucherId },
      data: { usedAt: null },
    });
    await tx.voucher.update({ where: { voucherId: order.voucherId }, data: { quota: { increment: 1 } } });
  }

  return notices;
}

module.exports = {
  returnReadyStock,
  cancelOrderTx,
};
