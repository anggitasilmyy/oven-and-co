// services/notificationRules.service.js
// FR-18 · BR-007 · SPEC §4 · C-24 — isi notifikasi in-app (fungsi murni, tanpa database).
// Port server dari client/src/utils/rules/notification.js (buildOrderStatusNotification, buildPointsNotification)
// dengan teks, tanda, dan pemotongan yang sama. Hasilnya berbentuk `data` Prisma tabel notifications.

const {
  ORDER_STATUS, NOTIFICATION_TYPE, ORDER_STATUS_NOTIFICATION, NOTIFICATION_TITLE_MAX, NOTIFICATION_BODY_MAX,
} = require('../utils/businessConstants');

/** Potong teks agar muat di kolom (sama dengan client: karakter terakhir diganti "…") */
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Format angka Indonesia (client utils/format.js formatNumber): 1250 → "1.250" */
const formatNumber = (value) => Number(value ?? 0).toLocaleString('id-ID');

/**
 * Notifikasi perubahan status pesanan untuk pemilik pesanan.
 * @param {{orderId: bigint, orderNumber: string, userId: bigint, pickupCode?: string|null}} order — baris orders
 * @param {string} status — status baru (ORDER_STATUS)
 * @param {{note?: string|null}} [opts] — alasan pembatalan ditambahkan ke isi
 * @returns {{userId: bigint, type: string, title: string, body: string, orderId: bigint}}
 */
function buildOrderStatusNotification(order, status, { note } = {}) {
  const text = ORDER_STATUS_NOTIFICATION[status];
  if (!text) throw new Error(`Status tidak dikenal: ${status}`);

  let body = text.body.replace('{order}', order.orderNumber);
  if (status === ORDER_STATUS.SIAP_DIAMBIL && order.pickupCode) body += ` Kode pickup: ${order.pickupCode}.`;
  if (status === ORDER_STATUS.DIBATALKAN && note) body += ` Alasan: ${note}`;

  return {
    userId: order.userId,
    type: NOTIFICATION_TYPE.ORDER_STATUS,
    title: clip(text.title, NOTIFICATION_TITLE_MAX),
    body: clip(body, NOTIFICATION_BODY_MAX),
    orderId: order.orderId,
  };
}

/**
 * Notifikasi perubahan poin (earn, review_bonus, refund). Poin yang ditukar (redeem) tidak dinotifikasi karena
 * dilakukan pelanggan sendiri saat checkout (sama dengan client).
 * @param {{userId: bigint, points: number, reason: string, orderId?: bigint|null}} p — reason dari POINTS_NOTIFICATION_REASON
 */
function buildPointsNotification({ userId, points, reason, orderId = null }) {
  const sign = points >= 0 ? '+' : '−';
  return {
    userId,
    type: NOTIFICATION_TYPE.POINTS,
    title: clip(`${sign}${formatNumber(Math.abs(points))} poin`, NOTIFICATION_TITLE_MAX),
    body: clip(`${points >= 0 ? 'Poin bertambah' : 'Poin berkurang'} dari ${reason}.`, NOTIFICATION_BODY_MAX),
    orderId,
  };
}

module.exports = {
  clip,
  buildOrderStatusNotification,
  buildPointsNotification,
};
