// services/adminOrderActions.service.js
// FR-28 · BR-09 · UC-20 · UC-21 · AD-04 — ubah status, verifikasi kode pickup, tandai lunas Bayar di Toko (Staf/Owner).
// Port server dari client/src/services/mock/adminOrderWrites.js dengan aturan & pesan sama (adminOrderRules.service.js).
// Penulisan dilakukan dalam satu transaksi setelah baris pesanan dikunci (FOR UPDATE) lalu dibaca ulang: klik ganda,
// tab lain, atau pembatalan pelanggan yang bersamaan diproses berurutan dan request kedua melihat status terbaru,
// sehingga tidak ada transisi, riwayat, atau poin ganda. Step 6.5 C1: riwayat + notifikasi status, dan notifikasi poin
// earn saat Selesai, ditulis di transaksi yang sama (mock adminOrderWrites.js); salinan email dicetak setelah commit.
// Step 6.5 C5 · FR-37: audit log (update_order_status / mark_order_paid, entity orders, entity_id order_id) di transaksi
// yang sama. Urutan kunci (K5): orders X → pelaku users S (lockAuditActor, nonaktif → 401) → tulis → INSERT audit.
// markOrderPaid (K4): payments diubah berdasarkan PRIMARY KEY (tanpa gap lock indeks payments_order_id_fkey).

const prisma = require('../lib/prisma');
const {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_TRANSACTION_STATUS, FULFILLMENT_TYPE, POINT_TX_TYPE, POINTS_NOTIFICATION_REASON,
  AUDIT_ACTION, AUDIT_ENTITY,
} = require('../utils/businessConstants');
const { mapOrder } = require('./orderView.service');
const { pointsEarnedFor } = require('./orderRules.service');
const { recordOrderStatus, recordPointsNotice, emailAfterCommit } = require('./orderStatusRecorder.service');
const { lockAuditActor, recordAudit } = require('./auditLog.service');
const {
  ADMIN_ORDER_ERROR, STATUS_NOTE, validateAdminStatusChange, checkPickupCode, checkMarkPaidAtStore, httpStatusForRuleError,
} = require('./adminOrderRules.service');

const NOT_FOUND_MESSAGE = 'Pesanan tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const ruleError = (message) => httpError(httpStatusForRuleError(message), message);

/**
 * Kunci baris pesanan lalu baca di dalam transaksi (bentuk snake_case orderView.mapOrder + id asli).
 * Kunci WAJIB menjadi pembacaan pertama transaksi: di InnoDB REPEATABLE READ snapshot dibuat oleh SELECT biasa
 * pertama, jadi SELECT biasa sebelum FOR UPDATE membuat pembacaan ulang tetap melihat data lama (terbukti di uji
 * MySQL 8: 9 dari 10 request Selesai bersamaan lolos). Dengan urutan ini snapshot dibuat setelah kunci didapat.
 */
async function lockOrder(tx, orderNumber) {
  const locked = await tx.$queryRaw`SELECT order_id FROM orders WHERE order_number = ${orderNumber} FOR UPDATE`;
  if (locked.length === 0) throw httpError(404, NOT_FOUND_MESSAGE);
  const row = await tx.order.findUnique({ where: { orderNumber } });
  return { row, order: mapOrder(row) };
}

/**
 * BR-09: 1 poin per earn_amount_per_point rupiah setelah Selesai — sekali per pesanan (transaksi earn untuk pesanan
 * ini dicek di dalam kunci pesanan yang sama).
 * @returns {Promise<number>} poin yang diberikan (0 bila tidak ada)
 */
async function awardCompletionPoints(tx, row, now) {
  const settings = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: { earnAmountPerPoint: true } });
  if (!settings) throw httpError(500, 'Pengaturan toko belum tersedia.');
  const points = pointsEarnedFor(Number(row.total), { earn_amount_per_point: Number(settings.earnAmountPerPoint) });
  if (!Number.isSafeInteger(points) || points <= 0) return 0;

  const existing = await tx.pointTransaction.findFirst({
    where: { orderId: row.orderId, type: POINT_TX_TYPE.EARN },
    select: { pointTxId: true },
  });
  if (existing) return 0;

  await tx.pointTransaction.create({
    data: { userId: row.userId, type: POINT_TX_TYPE.EARN, points, orderId: row.orderId, createdAt: now },
  });
  return points;
}

/**
 * PATCH /api/admin/orders/:orderNumber/status — satu langkah sesuai urutan SPEC §4.
 * Stok tidak berubah di sini: stok ready sudah berkurang saat pesanan dibuat (TF-12).
 * @param {string|number|bigint} adminId — req.user.userId (pengubah di riwayat)
 * @param {{from?: string|null, to: string, pickup_code?: string|null, courier_name?: string|null}} input
 * @returns {Promise<{order_number, order_status, points_awarded}>}
 */
async function changeOrderStatus(adminId, orderNumber, input, now = new Date()) {
  return emailAfterCommit(prisma.$transaction(async (tx) => {
    const { row, order } = await lockOrder(tx, orderNumber);
    await lockAuditActor(tx, adminId); // C5: orders X → pelaku S, sebelum penulisan apa pun
    const error = validateAdminStatusChange(order, {
      from: input.from, to: input.to, pickupCode: input.pickup_code, courierName: input.courier_name,
    });
    if (error) throw ruleError(error);

    const courierName = input.to === ORDER_STATUS.DALAM_PENGIRIMAN ? String(input.courier_name).trim() : null;
    await tx.order.update({
      where: { orderId: row.orderId },
      data: { orderStatus: input.to, ...(courierName ? { courierName } : {}) },
    });

    let note = null;
    if (courierName) note = STATUS_NOTE.COURIER(courierName);
    if (input.to === ORDER_STATUS.SELESAI && order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) note = STATUS_NOTE.PICKUP_VERIFIED;
    // Urutan kunci: orders X → riwayat (FK admin: users S) → notifikasi (FK pelanggan: users S) → poin & notifikasi
    // poin (users S pelanggan). Pola orders X → users S sama dengan pembatalan pelanggan (Step 6.3).
    const notices = [await recordOrderStatus(tx, row, input.to, { changedBy: adminId, note, now })];

    const pointsAwarded = input.to === ORDER_STATUS.SELESAI ? await awardCompletionPoints(tx, row, now) : 0;
    if (pointsAwarded > 0) {
      notices.push(await recordPointsNotice(tx, {
        userId: row.userId, points: pointsAwarded, reason: POINTS_NOTIFICATION_REASON.EARN(orderNumber), orderId: row.orderId, now,
      }));
    }
    await recordAudit(tx, { actorId: adminId, action: AUDIT_ACTION.UPDATE_ORDER_STATUS, entity: AUDIT_ENTITY.ORDERS, entityId: row.orderId, now });
    return { result: { order_number: orderNumber, order_status: input.to, points_awarded: pointsAwarded }, notices };
  }));
}

/**
 * POST /api/admin/orders/:orderNumber/verify-pickup — UC-21: cek kode tanpa menulis data. Penyimpanan status Selesai
 * tetap memeriksa ulang kode. Kode pickup tidak pernah dikirim balik.
 * @returns {Promise<{valid: true}>}
 */
async function verifyPickupCode(orderNumber, code) {
  const row = await prisma.order.findUnique({ where: { orderNumber } });
  if (!row) throw httpError(404, NOT_FOUND_MESSAGE);
  const order = mapOrder(row);
  if (order.fulfillment_type !== FULFILLMENT_TYPE.PICKUP) throw ruleError(ADMIN_ORDER_ERROR.NOT_PICKUP);
  const error = checkPickupCode(order, code);
  if (error) throw ruleError(error);
  return { valid: true };
}

/**
 * PATCH /api/admin/orders/:orderNumber/mark-paid — FR-28: orders.payment_status & payments (status, paid_at, amount)
 * diperbarui bersamaan. Status pesanan tidak berubah sehingga tidak ada riwayat status.
 * @param {string|number|bigint} adminId — req.user.userId (pelaku audit)
 * @returns {Promise<{order_number, payment_status, paid_at}>}
 */
async function markOrderPaid(adminId, orderNumber, now = new Date()) {
  // payments.paid_at DATETIME(0): detik penuh agar respons = nilai yang tersimpan
  const paidAt = new Date(Math.floor(now.getTime() / 1000) * 1000);

  return prisma.$transaction(async (tx) => {
    const { row, order } = await lockOrder(tx, orderNumber);
    await lockAuditActor(tx, adminId); // C5 (K5): pelaku S SEBELUM UPDATE payments & INSERT audit
    const error = checkMarkPaidAtStore(order);
    if (error) throw ruleError(error);

    await tx.order.update({ where: { orderId: row.orderId }, data: { paymentStatus: PAYMENT_STATUS.PAID } });
    // K4: id pembayaran dibaca tanpa kunci (pesanan sudah terkunci), lalu UPDATE berdasarkan PRIMARY KEY — tanpa
    // next-key/gap lock indeks payments_order_id_fkey (pola F-C3-1)
    const paymentIds = (await tx.payment.findMany({ where: { orderId: row.orderId }, select: { paymentId: true } }))
      .map((p) => p.paymentId);
    if (paymentIds.length) {
      await tx.payment.updateMany({
        where: { paymentId: { in: paymentIds } },
        data: { status: PAYMENT_TRANSACTION_STATUS.PAID, paidAt, amount: row.total },
      });
    }
    await recordAudit(tx, { actorId: adminId, action: AUDIT_ACTION.MARK_ORDER_PAID, entity: AUDIT_ENTITY.ORDERS, entityId: row.orderId, now });
    return { order_number: orderNumber, payment_status: PAYMENT_STATUS.PAID, paid_at: paidAt.toISOString() };
  });
}

module.exports = {
  NOT_FOUND_MESSAGE,
  changeOrderStatus,
  verifyPickupCode,
  markOrderPaid,
};
