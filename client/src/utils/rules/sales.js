// utils/rules/sales.js
// Aturan penjualan & pesanan untuk Dashboard (dipindah dari businessRules.js di Step 5.1 tanpa mengubah perilaku)
// FR-27

import { ORDER_STATUS, PAYMENT_STATUS, NEEDS_PROCESSING_STATUSES } from '../../constants/orderStatus';
import { dateKeyOf } from '../date';

/**
 * Pesanan dihitung sebagai penjualan bila sudah lunas dan tidak dibatalkan.
 * Satu definisi untuk omzet, grafik 7 hari, dan produk terlaris agar angka tidak bertentangan.
 */
export function isSalesOrder(order) {
  return order.payment_status === PAYMENT_STATUS.PAID && order.order_status !== ORDER_STATUS.DIBATALKAN;
}

/** Omzet & jumlah transaksi lunas per tanggal pesan untuk daftar kunci tanggal */
export function aggregateDailySales(orders, dateKeys) {
  const byDate = Object.fromEntries(dateKeys.map((k) => [k, { date: k, revenue: 0, orders: 0 }]));
  for (const order of orders) {
    if (!isSalesOrder(order)) continue;
    const bucket = byDate[dateKeyOf(order.created_at)];
    if (bucket) {
      bucket.revenue += order.total;
      bucket.orders += 1;
    }
  }
  return dateKeys.map((k) => byDate[k]);
}

/** Persentase perubahan; null bila pembanding nol */
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Produk terlaris berdasarkan jumlah terjual pada pesanan penjualan dalam rentang tanggal.
 * @returns {Array<{product_id, quantity}>} urut menurun; seri diurutkan product_id agar stabil
 */
export function getBestSellerTotals(orders, orderItems, dateKeys, limit) {
  const validDates = new Set(dateKeys);
  const salesOrderIds = new Set(
    orders.filter((o) => isSalesOrder(o) && validDates.has(dateKeyOf(o.created_at))).map((o) => o.order_id)
  );
  const totals = new Map();
  for (const item of orderItems) {
    if (!salesOrderIds.has(item.order_id)) continue;
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity);
  }
  return [...totals.entries()]
    .map(([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.product_id - b.product_id)
    .slice(0, limit);
}

/** Jumlah pesanan per status (semua status dari constants, nol bila tidak ada) */
export function countOrdersByStatus(orders) {
  const counts = Object.fromEntries(Object.values(ORDER_STATUS).map((s) => [s, 0]));
  for (const o of orders) counts[o.order_status] += 1;
  return counts;
}

/** Pesanan yang perlu diproses staf (KPI FR-27) */
export function countNeedsProcessing(orders) {
  return orders.filter((o) => NEEDS_PROCESSING_STATUSES.includes(o.order_status)).length;
}
