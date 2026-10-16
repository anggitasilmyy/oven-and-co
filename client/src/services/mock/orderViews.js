// services/mock/orderViews.js
// Step 4 · Baris pesanan siap tampil untuk admin (join orders, users, payments, item, produk)

import { getTables } from './db';
import { getMockUsers } from './users';

/** Ringkasan item, mis. "Classic Butter Croissant ×2, +1 lainnya" */
function summarizeItems(items, productName) {
  if (items.length === 0) return '-';
  const [first, ...rest] = items;
  const head = `${productName(first.product_id)} ×${first.quantity}`;
  return rest.length ? `${head}, +${rest.length} lainnya` : head;
}

/** Semua pesanan sebagai baris admin, urut terbaru dulu */
export function getAdminOrderRows() {
  const { orders, order_items, payments, payment_methods, products } = getTables(
    'orders', 'order_items', 'payments', 'payment_methods', 'products'
  );
  const users = new Map(getMockUsers().map((u) => [u.user_id, u]));
  const methods = new Map(payment_methods.map((m) => [m.method_code, m.name]));
  const productName = (pid) => products.find((p) => p.product_id === pid)?.name ?? 'Produk';
  const itemsByOrder = new Map();
  for (const item of order_items) {
    itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  }
  const paymentByOrder = new Map(payments.map((p) => [p.order_id, p]));

  return orders
    .map((o) => {
      const items = itemsByOrder.get(o.order_id) ?? [];
      const methodCode = paymentByOrder.get(o.order_id)?.method_code ?? null;
      return {
        order_id: o.order_id,
        order_number: o.order_number,
        created_at: o.created_at,
        customer_name: users.get(o.user_id)?.name ?? 'Pelanggan',
        fulfillment_type: o.fulfillment_type,
        ready_date: o.ready_date,
        time_slot: o.time_slot,
        total: o.total,
        payment_option: o.payment_option,
        payment_status: o.payment_status,
        method_code: methodCode,
        method_name: methods.get(methodCode) ?? '-',
        order_status: o.order_status,
        item_count: items.reduce((s, i) => s + i.quantity, 0),
        items_summary: summarizeItems(items, productName),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
