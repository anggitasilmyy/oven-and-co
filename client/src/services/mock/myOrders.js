// services/mock/myOrders.js
// Step 5.3 – 5.4 · Pesanan milik pelanggan login (pengganti pemeriksaan kepemilikan di API Step 6.3).
// Dipindah dari orderService.js di Step 5.4 agar dipakai juga service riwayat/tracking & ulasan.

import { getTables } from './db';
import { requireMockRole } from './mockSession';
import { ROLES } from '../../constants/roles';

const ORDER_TABLES = ['orders', 'order_items', 'payments', 'payment_methods', 'products'];

/**
 * Pesanan milik pelanggan login + data terkait; lempar error bila tidak ditemukan.
 * @param {string} orderNumber
 * @param {...string} extraTables — tabel tambahan yang ikut dibaca
 * @returns {{user, order, payment, items, t}}
 */
export function findMyOrder(orderNumber, ...extraTables) {
  const user = requireMockRole(ROLES.CUSTOMER);
  const t = getTables(...ORDER_TABLES, ...extraTables);
  const order = t.orders.find((o) => o.order_number === orderNumber && o.user_id === user.user_id);
  if (!order) throw new Error('Pesanan tidak ditemukan');
  const payment = t.payments.find((p) => p.order_id === order.order_id);
  const items = t.order_items.filter((i) => i.order_id === order.order_id);
  return { user, order, payment, items, t };
}
