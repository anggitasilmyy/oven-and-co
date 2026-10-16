// services/mock/orderEffects.js
// Step 5.3 · TF-12 · BR-06 · BR-10 — efek samping pesanan di mode mock: stok ready, kode bayar, pembatalan.

import { getTables, updateTable, nextUserRowId } from './db';
import { getMockCurrentTime } from './mockClock';
import { dateKeyOf } from '../../utils/date';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { PAYMENT_CODE_PREFIX, PAYMENT_GROUP } from '../../constants/checkout';
import { ORDER_STATUS } from '../../constants/orderStatus';

/** n digit acak (kode pickup & kode bayar simulasi) */
export const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Kode bayar simulasi per kelompok metode (payments.payment_code); Bayar di Toko tanpa kode */
export function paymentCodeFor(method, order) {
  if (method.method_group === PAYMENT_GROUP.STORE) return null;
  if (method.method_group === PAYMENT_GROUP.QRIS) return `${PAYMENT_CODE_PREFIX.qris}${order.order_number}`;
  if (method.method_group === PAYMENT_GROUP.VA) return `${PAYMENT_CODE_PREFIX.va}${randomDigits(10)}`;
  return `${PAYMENT_CODE_PREFIX.ewallet}${randomDigits(8)}`;
}

/**
 * Stok ready berkurang saat pesanan dibuat (sign = 1) dan kembali saat dibatalkan (sign = -1) — TF-12.
 * @param {Array<{product_id, availability_type, quantity}>} lines
 */
export function addStockSold(lines, dateKey, sign) {
  const ready = lines.filter((l) => l.availability_type === AVAILABILITY_TYPE.READY);
  if (ready.length === 0) return;
  updateTable('daily_stocks', (rows) => rows.map((s) => {
    if (s.stock_date !== dateKey) return s;
    const qty = ready.filter((l) => l.product_id === s.product_id).reduce((n, l) => n + l.quantity, 0);
    return qty ? { ...s, qty_sold: Math.max(0, s.qty_sold + sign * qty) } : s;
  }));
}

/**
 * Batalkan pesanan: stok ready kembali, voucher bisa dipakai lagi, poin yang ditukar dikembalikan (refund).
 * @param {object} order
 * @param {{cancelReason: string, paymentRowStatus?: string}} changes — paymentRowStatus: status baris payments baru
 */
export function cancelOrder(order, { cancelReason, paymentRowStatus }) {
  const { order_items, products } = getTables('order_items', 'products');
  const lines = order_items
    .filter((i) => i.order_id === order.order_id)
    .map((i) => ({ ...i, availability_type: products.find((p) => p.product_id === i.product_id)?.availability_type }));
  updateTable('orders', (rows) => rows.map((o) => (o.order_id === order.order_id
    ? { ...o, order_status: ORDER_STATUS.DIBATALKAN, cancel_reason: cancelReason } : o)));
  if (paymentRowStatus) {
    updateTable('payments', (rows) => rows.map((p) => (p.order_id === order.order_id ? { ...p, status: paymentRowStatus } : p)));
  }
  addStockSold(lines, dateKeyOf(order.created_at), -1);
  if (order.voucher_id) {
    updateTable('user_vouchers', (rows) => rows.map((c) => (c.user_id === order.user_id && c.voucher_id === order.voucher_id ? { ...c, used_at: null } : c)));
    updateTable('vouchers', (rows) => rows.map((v) => (v.voucher_id === order.voucher_id ? { ...v, quota: v.quota + 1 } : v)));
  }
  if (order.points_used > 0) {
    updateTable('point_transactions', (rows) => [...rows, {
      point_tx_id: nextUserRowId(rows, 'point_tx_id'), user_id: order.user_id, type: 'refund',
      points: order.points_used, order_id: order.order_id, review_id: null, created_at: getMockCurrentTime().toISOString(),
    }]);
  }
}
