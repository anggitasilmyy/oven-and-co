// services/orderStatusRecorder.service.js
// FR-18 · BR-007 · SPEC §4 · NFR-05 — satu pintu pencatatan perubahan status pesanan & notifikasi pelanggan.
// Port server dari client/src/services/mock/orderEffects.js recordOrderStatus + mock/notifications.js logMockEmails.
//
// Aturan transaksi (Step 6.5 C1):
//   - recordOrderStatus & recordPointsNotice WAJIB dipanggil dengan `tx` transaksi yang sama dengan perubahan bisnisnya:
//     rollback membatalkan riwayat, notifikasi, dan perubahan bisnis bersama-sama.
//   - Hanya logNotificationEmails (salinan email ke console, TF-14 · SPEC §10) yang berjalan SETELAH commit, lewat
//     emailAfterCommit. Transaksi yang gagal tidak pernah mencetak email.
//   - INSERT riwayat & notifikasi memeriksa FK users (kunci S baris pengguna) dan orders. Pemanggil menaruhnya di
//     kelompok INSERT ber-FK users yang sudah ada (setelah kunci orders, SEBELUM daily_stocks / vouchers) — urutan
//     kunci Step 6.3/6.4 (catatan "Integrasi MySQL 8 (C4)") tidak berubah.

const prisma = require('../lib/prisma');
const { NOTIFICATION_EMAIL_LOG_PREFIX } = require('../utils/businessConstants');
const { buildOrderStatusNotification, buildPointsNotification } = require('./notificationRules.service');

async function insertNotification(tx, notice, now) {
  await tx.notification.create({ data: { ...notice, isRead: false, createdAt: now } });
  return notice;
}

/**
 * Satu perubahan status = tepat satu baris order_status_histories + satu notifikasi order_status untuk pemilik pesanan.
 * @param {object} tx — klien transaksi Prisma
 * @param {{orderId: bigint, orderNumber: string, userId: bigint, pickupCode?: string|null}} order
 * @param {string} status — status baru
 * @param {{changedBy?: string|number|bigint|null, note?: string|null, now: Date}} opts — changedBy null = sistem
 * @returns {Promise<object>} notifikasi yang ditulis (untuk salinan email setelah commit)
 */
async function recordOrderStatus(tx, order, status, { changedBy = null, note = null, now }) {
  await tx.orderStatusHistory.create({
    data: { orderId: order.orderId, status, changedBy: changedBy == null ? null : BigInt(changedBy), note, changedAt: now },
  });
  return insertNotification(tx, buildOrderStatusNotification(order, status, { note }), now);
}

/**
 * Notifikasi poin (earn, review_bonus, refund) — dipanggil di transaksi yang sama dengan INSERT point_transactions.
 * @param {object} tx
 * @param {{userId: bigint, points: number, reason: string, orderId?: bigint|null, now: Date}} p
 */
async function recordPointsNotice(tx, { userId, points, reason, orderId = null, now }) {
  return insertNotification(tx, buildPointsNotification({ userId, points, reason, orderId }), now);
}

/**
 * FR-18 "in-app + email": salinan email dicetak ke console (TF-14 · SPEC §10). Hanya dipanggil SETELAH commit.
 * Tidak pernah melempar error: kegagalan mencetak tidak boleh mengubah hasil aksi yang sudah tersimpan.
 * @param {Array<{userId: bigint, title: string, body: string}>} notices
 */
async function logNotificationEmails(notices, client = prisma) {
  if (!notices?.length) return;
  try {
    const ids = [...new Set(notices.map((n) => String(n.userId)))].map((id) => BigInt(id));
    const users = await client.user.findMany({ where: { userId: { in: ids } }, select: { userId: true, email: true } });
    const emailOf = new Map(users.map((u) => [String(u.userId), u.email]));
    for (const notice of notices) {
      const email = emailOf.get(String(notice.userId));
      if (email) console.info(`${NOTIFICATION_EMAIL_LOG_PREFIX} Kepada: ${email} · ${notice.title} — ${notice.body}`);
    }
  } catch (error) {
    console.error('[Notifikasi] Gagal mencetak salinan email:', error.message);
  }
}

/**
 * Tunggu transaksi selesai (commit), BARU cetak salinan email. Bila transaksi gagal (rollback), error diteruskan
 * dan tidak ada email yang dicetak.
 * @param {Promise<{result: any, notices: Array}>} transaction — hasil prisma.$transaction yang mengembalikan {result, notices}
 * @returns {Promise<any>} result
 */
async function emailAfterCommit(transaction) {
  const { result, notices } = await transaction;
  await logNotificationEmails(notices);
  return result;
}

module.exports = {
  recordOrderStatus,
  recordPointsNotice,
  logNotificationEmails,
  emailAfterCommit,
};
