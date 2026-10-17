// services/mock/seed/notifications.js
// Step 5.5 · FR-18 · C-24 — notifikasi contoh akun demo pelanggan, diturunkan dari data contoh lain:
// riwayat status pesanannya (order_status), poin yang diperoleh (points), dan voucher aktif (promo).
// Notifikasi sebelum hari ini dianggap sudah dibaca; notifikasi hari ini belum dibaca.

import { dateKeyOf } from '../../../utils/date';
import { atTime } from '../mockClock';
import { isVoucherActiveOn } from '../../../utils/rules/promo';
import {
  buildOrderStatusNotification, buildPointsNotification, buildPromoNotification,
} from '../../../utils/rules/notification';

/** Jam notifikasi promo contoh pada tanggal mulai voucher (asumsi prototype) */
const PROMO_NOTIFY_TIME = '09:00';

/** Hanya notifikasi contoh terbaru yang disimpan agar daftar C-24 tetap ringkas saat demo (asumsi prototype) */
const SEED_NOTIFICATION_LIMIT = 30;

/**
 * @param {{orders, histories, pointTransactions, vouchers, demoCustomerId, todayKey, now: Date}} p
 * @returns {Array} notifications (notification_id berurutan dari 1, terlama dulu)
 */
export function buildNotifications({ orders, histories, pointTransactions, vouchers, demoCustomerId, todayKey, now }) {
  const rows = [];
  const add = (entry, createdAt) => {
    if (new Date(createdAt) > now) return; // data contoh tidak pernah di masa depan
    rows.push({ ...entry, created_at: createdAt });
  };

  const myOrders = new Map(orders.filter((o) => o.user_id === demoCustomerId).map((o) => [o.order_id, o]));
  for (const h of histories) {
    const order = myOrders.get(h.order_id);
    if (order) add(buildOrderStatusNotification(order, h.status, { note: order.cancel_reason }), h.changed_at);
  }
  for (const tx of pointTransactions) {
    if (tx.user_id !== demoCustomerId || tx.points <= 0) continue;
    const order = tx.order_id ? myOrders.get(tx.order_id) : null;
    // Saldo awal (tanpa pesanan/ulasan) bukan peristiwa yang perlu dinotifikasi
    if (tx.type === 'earn' && order) {
      add(buildPointsNotification({
        user_id: demoCustomerId, points: tx.points, reason: `pesanan ${order.order_number}`, order_id: order.order_id,
      }), tx.created_at);
    } else if (tx.type === 'review_bonus') {
      add(buildPointsNotification({ user_id: demoCustomerId, points: tx.points, reason: 'ulasan produk' }), tx.created_at);
    }
  }
  for (const v of vouchers.filter((x) => isVoucherActiveOn(x, todayKey))) {
    add(buildPromoNotification(demoCustomerId, v), atTime(v.valid_from, PROMO_NOTIFY_TIME).toISOString());
  }

  return rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-SEED_NOTIFICATION_LIMIT)
    .map((n, i) => ({
      notification_id: i + 1, user_id: n.user_id, type: n.type, title: n.title, body: n.body,
      order_id: n.order_id ?? null, is_read: dateKeyOf(n.created_at) < todayKey, created_at: n.created_at,
    }));
}
