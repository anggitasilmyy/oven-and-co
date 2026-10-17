// services/mock/orderCancellation.js
// Step 5.3 · BR-06 · TF-12 · BR-10 — pembatalan pesanan sebagai fungsi murni atas baris tabel mock.
// Dipakai cancelOrder (orderEffects.js) dan pemeriksaan kedaluwarsa di getTables (db.js) — pengganti
// job autoCancelOrders (Step 6.5). Sengaja TIDAK mengimpor db.js agar tidak terjadi circular import.
// Step 5.4: dipakai juga pembatalan oleh pelanggan (FR-20, BR-08) — refund pesanan lunas & riwayat status.
// Step 5.5: pembatalan memicu notifikasi status (FR-18, SPEC §4) dan notifikasi poin bila poin dikembalikan.

import { nextUserRowId, isUserRow } from './userRows';
import { appendStatusHistory } from './statusHistory';
import { appendNotifications } from './notifications';
import { dateKeyOf } from '../../utils/date';
import { getPaymentSecondsLeft } from '../../utils/rules/order';
import { buildOrderStatusNotification, buildPointsNotification } from '../../utils/rules/notification';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../constants/orderStatus';
import { PAYMENT_TIMEOUT_CANCEL_REASON } from '../../constants/checkout';

/** Tabel yang dibaca/diubah saat pesanan dibatalkan */
export const CANCELLATION_TABLES = [
  'orders', 'payments', 'order_items', 'products', 'daily_stocks', 'user_vouchers', 'vouchers', 'point_transactions',
  'order_status_histories',
  'notifications', // Step 5.5
];

/**
 * Stok ready terjual ditambah (sign = 1) atau dikembalikan (sign = -1) pada tanggal tertentu — TF-12.
 * @param {Array<{product_id, availability_type, quantity}>} lines
 * @returns {Array} daily_stocks baru
 */
export function applyStockDelta(dailyStocks, lines, dateKey, sign) {
  const ready = lines.filter((l) => l.availability_type === AVAILABILITY_TYPE.READY);
  if (ready.length === 0) return dailyStocks;
  return dailyStocks.map((s) => {
    if (s.stock_date !== dateKey) return s;
    const qty = ready.filter((l) => l.product_id === s.product_id).reduce((n, l) => n + l.quantity, 0);
    return qty ? { ...s, qty_sold: Math.max(0, s.qty_sold + sign * qty) } : s;
  });
}

/**
 * Batalkan satu pesanan: status Dibatalkan, stok ready kembali, voucher bisa dipakai lagi (kuota +1),
 * poin yang ditukar dikembalikan (refund). Step 5.4: pesanan lunas → payment_status refunded (BR-08,
 * SPEC §10 hanya mencatat) dan perubahan status dicatat di order_status_histories.
 * @param {object} t — tabel CANCELLATION_TABLES
 * @param {{cancelReason: string, paymentRowStatus?: string, now: Date, changedBy?: number|null}} opts
 *   changedBy: user_id pelanggan; null = sistem (pembatalan otomatis)
 * @returns {object} tabel yang berubah { nama: rows }
 */
export function cancelOrderInTables(t, order, { cancelReason, paymentRowStatus, now, changedBy = null }) {
  const lines = t.order_items
    .filter((i) => i.order_id === order.order_id)
    .map((i) => ({ ...i, availability_type: t.products.find((p) => p.product_id === i.product_id)?.availability_type }));
  const changed = {
    orders: t.orders.map((o) => (o.order_id === order.order_id
      ? {
        ...o, order_status: ORDER_STATUS.DIBATALKAN, cancel_reason: cancelReason,
        payment_status: o.payment_status === PAYMENT_STATUS.PAID ? PAYMENT_STATUS.REFUNDED : o.payment_status,
      } : o)),
    daily_stocks: applyStockDelta(t.daily_stocks, lines, dateKeyOf(order.created_at), -1),
    order_status_histories: appendStatusHistory(t.order_status_histories, [{
      order_id: order.order_id, status: ORDER_STATUS.DIBATALKAN, changed_by: changedBy, note: cancelReason, changed_at: now.toISOString(),
    }]),
  };
  if (paymentRowStatus) {
    changed.payments = t.payments.map((p) => (p.order_id === order.order_id ? { ...p, status: paymentRowStatus } : p));
  }
  if (order.voucher_id) {
    changed.user_vouchers = t.user_vouchers.map((c) => (c.user_id === order.user_id && c.voucher_id === order.voucher_id ? { ...c, used_at: null } : c));
    changed.vouchers = t.vouchers.map((v) => (v.voucher_id === order.voucher_id ? { ...v, quota: v.quota + 1 } : v));
  }
  const notices = [buildOrderStatusNotification(order, ORDER_STATUS.DIBATALKAN, { note: cancelReason })];
  if (order.points_used > 0) {
    changed.point_transactions = [...t.point_transactions, {
      point_tx_id: nextUserRowId(t.point_transactions, 'point_tx_id'), user_id: order.user_id, type: 'refund',
      points: order.points_used, order_id: order.order_id, review_id: null, created_at: now.toISOString(),
    }];
    notices.push(buildPointsNotification({
      user_id: order.user_id, points: order.points_used, reason: `pembatalan pesanan ${order.order_number}`, order_id: order.order_id,
    }));
  }
  // Step 5.5: notifikasi in-app untuk pelanggan pemilik pesanan (FR-18)
  changed.notifications = appendNotifications(t.notifications ?? [], notices, now.toISOString());
  return changed;
}

/**
 * BR-06: pesanan online buatan pelanggan yang masih Menunggu Pembayaran (pembayaran pending) dan sudah
 * lewat expired_at dibatalkan. Data contoh (id < USER_ROW_ID_START) dan pesanan lunas/Bayar di Toko tidak disentuh.
 * @param {{read: Function, write: Function, now: Date, onNotified?: Function}} io — akses tabel mentah (readMock/writeMock);
 *   onNotified(notifikasi baru) dipanggil setelah ditulis (Step 5.5: salinan email di console)
 * @returns {number} jumlah pesanan yang dibatalkan
 */
export function expireOverdueUserOrders({ read, write, now, onNotified }) {
  const orders = [read('orders', [])].flat();
  const pending = orders.filter((o) => isUserRow(o, 'order_id') && o.order_status === ORDER_STATUS.MENUNGGU_PEMBAYARAN);
  if (pending.length === 0) return 0;
  const payments = [read('payments', [])].flat();
  const overdue = pending.filter((o) => {
    const payment = payments.find((p) => p.order_id === o.order_id);
    return payment?.status === 'pending' && getPaymentSecondsLeft(payment.expired_at, now) === 0;
  });
  if (overdue.length === 0) return 0;

  let t = Object.fromEntries(CANCELLATION_TABLES.map((n) => [n, [read(n, [])].flat()]));
  const touched = new Set();
  const notifiedFrom = t.notifications.length;
  for (const order of overdue) {
    const changed = cancelOrderInTables(t, order, { cancelReason: PAYMENT_TIMEOUT_CANCEL_REASON, paymentRowStatus: 'expired', now });
    Object.keys(changed).forEach((n) => touched.add(n));
    t = { ...t, ...changed };
  }
  touched.forEach((n) => write(n, t[n]));
  onNotified?.(t.notifications.slice(notifiedFrom));
  return overdue.length;
}
