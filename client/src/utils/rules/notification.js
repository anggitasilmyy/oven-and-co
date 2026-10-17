// utils/rules/notification.js
// Step 5.5 · FR-18 · BR-007 · SPEC §4 — isi notifikasi in-app & pengelompokan C-24 (fungsi murni).
// Setiap perubahan status pesanan memicu satu notifikasi order_status untuk pemilik pesanan (SPEC §4).

import {
  NOTIFICATION_TYPE, ORDER_STATUS_NOTIFICATION, NOTIFICATION_GROUP, NOTIFICATION_TITLE_MAX, NOTIFICATION_BODY_MAX,
} from '../../constants/notification';
import { ORDER_STATUS } from '../../constants/orderStatus';
import { dateKeyOf } from '../date';
import { formatNumber } from '../format';

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Notifikasi perubahan status pesanan.
 * @param {object} order — baris orders (order_id, order_number, user_id, pickup_code)
 * @param {string} status — status baru
 * @param {{note?: string}} [opts] — alasan pembatalan ditambahkan ke isi
 * @returns {{user_id, type, title, body, order_id}}
 */
export function buildOrderStatusNotification(order, status, { note } = {}) {
  const text = ORDER_STATUS_NOTIFICATION[status];
  if (!text) throw new Error(`Status tidak dikenal: ${status}`);
  let body = text.body.replace('{order}', order.order_number);
  if (status === ORDER_STATUS.SIAP_DIAMBIL && order.pickup_code) body += ` Kode pickup: ${order.pickup_code}.`;
  if (status === ORDER_STATUS.DIBATALKAN && note) body += ` Alasan: ${note}`;
  return {
    user_id: order.user_id,
    type: NOTIFICATION_TYPE.ORDER_STATUS,
    title: clip(text.title, NOTIFICATION_TITLE_MAX),
    body: clip(body, NOTIFICATION_BODY_MAX),
    order_id: order.order_id,
  };
}

/**
 * Notifikasi perubahan poin (earn, review_bonus, refund). Poin ditukar (redeem) tidak dinotifikasi karena
 * dilakukan pelanggan sendiri saat checkout.
 * @param {{user_id, points, reason: string, order_id?: number|null}} p — reason mis. "pesanan OVC-…"
 */
export function buildPointsNotification({ user_id, points, reason, order_id = null }) {
  const sign = points >= 0 ? '+' : '−';
  return {
    user_id,
    type: NOTIFICATION_TYPE.POINTS,
    title: clip(`${sign}${formatNumber(Math.abs(points))} poin`, NOTIFICATION_TITLE_MAX),
    body: clip(`${points >= 0 ? 'Poin bertambah' : 'Poin berkurang'} dari ${reason}.`, NOTIFICATION_BODY_MAX),
    order_id,
  };
}

/** Notifikasi promo dari voucher aktif */
export function buildPromoNotification(userId, voucher) {
  return {
    user_id: userId,
    type: NOTIFICATION_TYPE.PROMO,
    title: clip(`Promo ${voucher.code}`, NOTIFICATION_TITLE_MAX),
    body: clip(`${voucher.title}. Pakai kode ${voucher.code} saat checkout.`, NOTIFICATION_BODY_MAX),
    order_id: null,
  };
}

/** Jumlah notifikasi belum dibaca */
export const countUnread = (notifications) => notifications.filter((n) => !n.is_read).length;

/**
 * Kelompok C-24 "Hari ini" / "Sebelumnya", terbaru dulu. Kelompok kosong tidak dikembalikan.
 * @param {Array<{created_at}>} notifications
 * @param {string} todayKey — YYYY-MM-DD
 */
export function groupNotificationsByDay(notifications, todayKey) {
  const sorted = [...notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [
    { ...NOTIFICATION_GROUP.TODAY, items: sorted.filter((n) => dateKeyOf(n.created_at) === todayKey) },
    { ...NOTIFICATION_GROUP.EARLIER, items: sorted.filter((n) => dateKeyOf(n.created_at) !== todayKey) },
  ].filter((g) => g.items.length > 0);
}
