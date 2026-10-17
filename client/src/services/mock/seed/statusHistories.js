// services/mock/seed/statusHistories.js
// Step 5.4 · SPEC §4 · FR-17 — order_status_histories untuk pesanan contoh (diturunkan dari status akhirnya).
// Deterministik: waktu dihitung dari created_at, ready_date, dan "sekarang" mock — tidak pernah di masa depan.

import { ORDER_STATUS as S, PAYMENT_OPTION, PAYMENT_STATUS } from '../../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT, OPERATING_HOURS_DEFAULT } from '../../../constants/storeConfig';
import { PAYMENT_TIMEOUT_CANCEL_REASON } from '../../../constants/checkout';
import { getStatusPath } from '../../../utils/rules/orderTracking';
import { dateKeyOf } from '../../../utils/date';
import { atTime } from '../mockClock';
import { completedAt } from './derivedRecords';

const MINUTE = 60000;
const plus = (date, minutes) => new Date(date.getTime() + minutes * MINUTE);

/** Waktu pembatalan contoh sesuai alasannya (BR-06 batas bayar, BR-07 jam tutup, selain itu dibatalkan pelanggan) */
function cancelledAt(order, created, now) {
  if (order.cancel_reason === PAYMENT_TIMEOUT_CANCEL_REASON) return plus(created, STORE_SETTINGS_DEFAULT.payment_timeout_minutes);
  if (order.cancel_reason?.includes('BR-07')) return atTime(order.ready_date, OPERATING_HOURS_DEFAULT.close_time);
  return new Date(Math.min(plus(created, 20).getTime(), now.getTime()));
}

/**
 * @param {{orders: Array, todayKey: string, now: Date}} p
 * @returns {Array} order_status_histories
 */
export function buildStatusHistories({ orders, todayKey, now }) {
  const rows = [];
  const add = (order, status, date) => rows.push({
    history_id: rows.length + 1, order_id: order.order_id, status, changed_by: null, note: null, changed_at: date.toISOString(),
  });

  for (const order of orders) {
    const created = new Date(order.created_at);
    const online = order.payment_option === PAYMENT_OPTION.ONLINE;
    const path = getStatusPath(order);
    add(order, path[0], created);
    const paidAt = plus(created, 3);

    if (order.order_status === S.DIBATALKAN) {
      // Online yang direfund berarti sempat lunas (Dikonfirmasi) sebelum dibatalkan pelanggan (BR-08)
      if (online && order.payment_status === PAYMENT_STATUS.REFUNDED) add(order, S.DIKONFIRMASI, paidAt);
      add(order, S.DIBATALKAN, cancelledAt(order, created, now));
      continue;
    }

    const target = path.indexOf(order.order_status);
    let last = created;
    if (online && target >= 1) {
      add(order, S.DIKONFIRMASI, paidAt);
      last = paidAt;
    }
    const later = path.slice(online ? 2 : 1, target + 1); // Sedang Disiapkan … status akhir
    if (later.length === 0) continue;

    let end = order.order_status === S.SELESAI ? completedAt(order, todayKey, now) : plus(now, -5);
    if (end <= last) end = plus(last, later.length * 10);
    // Pre-order/custom mulai disiapkan pagi hari pada tanggal siap; produk ready ±30 menit setelah dikonfirmasi
    const preparedFrom = order.ready_date > dateKeyOf(order.created_at) ? atTime(order.ready_date, OPERATING_HOURS_DEFAULT.open_time) : plus(last, 30);
    let start = new Date(Math.max(preparedFrom.getTime(), plus(last, 5).getTime()));
    if (start >= end) start = new Date((last.getTime() + end.getTime()) / 2);
    later.forEach((status, i) => {
      const ratio = later.length === 1 ? 0 : i / (later.length - 1);
      add(order, status, new Date(start.getTime() + (end.getTime() - start.getTime()) * ratio));
    });
  }
  return rows;
}
