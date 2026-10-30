// services/notification.service.js
// FR-18 · UC-18 · C-24 Notifikasi — notifikasi in-app milik pelanggan login (tabel notifications, SPEC §8).
// Bentuk respons mengikuti client services/notificationService.js (id BIGINT sebagai string, waktu ISO).
// Step 6.3 hanya membaca & menandai dibaca; pembuatan notifikasi status pesanan menyusul di Step 6.5.
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const { getJakartaDateKey } = require('../utils/jakartaDate');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNotificationView(row) {
  return {
    notification_id: String(row.notificationId),
    user_id: String(row.userId),
    type: row.type,
    title: row.title,
    body: row.body,
    order_id: row.orderId == null ? null : String(row.orderId),
    // Tautan ke Detail Pesanan (C-16) bila notifikasi terkait pesanan
    order_number: row.order?.orderNumber ?? null,
    is_read: Boolean(row.isRead),
    created_at: toIsoString(row.createdAt),
  };
}

/** GET /api/me/notifications — terbaru dulu; today_key (WIB) untuk kelompok "Hari ini" */
async function getMyNotifications(userId, now = new Date()) {
  const rows = await prisma.notification.findMany({
    where: { userId: BigInt(userId) },
    orderBy: [{ createdAt: 'desc' }, { notificationId: 'desc' }],
    include: { order: { select: { orderNumber: true } } },
  });

  const items = rows.map(toNotificationView);

  return {
    items,
    unread: items.filter((item) => !item.is_read).length,
    today_key: getJakartaDateKey(now),
  };
}

/** GET /api/me/notifications/unread-count — angka penanda menu Notifikasi (C-20) */
function getUnreadCount(userId) {
  return prisma.notification.count({
    where: { userId: BigInt(userId), isRead: false },
  });
}

/**
 * PATCH /api/me/notifications/:notificationId/read — idempoten.
 * Notifikasi milik pelanggan lain diperlakukan sama dengan yang tidak ada (404, tanpa membocorkan keberadaannya).
 */
async function markAsRead(userId, notificationId) {
  const where = { notificationId: BigInt(notificationId), userId: BigInt(userId) };
  const found = await prisma.notification.findFirst({ where, select: { notificationId: true } });

  if (!found) {
    throw httpError(404, 'Notifikasi tidak ditemukan.');
  }

  // Bersyarat pemilik: tetap aman walau dua request bersamaan
  await prisma.notification.updateMany({
    where: { ...where, isRead: false },
    data: { isRead: true },
  });

  return { notification_id: String(notificationId), is_read: true };
}

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
};
