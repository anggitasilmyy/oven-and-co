// services/salesRules.service.js
// Step 6.4 · FR-27 · FR-33 · AD-02 (dan AD-08) — aturan murni penjualan, port dari client utils/rules/sales.js.
// Satu definisi "penjualan" (lunas & tidak dibatalkan) untuk omzet, grafik, dan produk terlaris agar angka Dashboard,
// Laporan, dan Beranda tidak bertentangan. Baris pesanan memakai bentuk snake_case:
// { created_at: Date|ISO, total: number, payment_status, order_status }. Tanggal = tanggal WIB dari created_at.

const { ORDER_STATUS, PAYMENT_STATUS, NEEDS_PROCESSING_STATUSES } = require('../utils/businessConstants');
const { getJakartaDateKey, addDaysToDateKey } = require('../utils/jakartaDate');

/** Rupiah dijumlah dalam sen agar tidak muncul galat pecahan floating point */
const toCents = (value) => Math.round(Number(value) * 100);

/** Pesanan dihitung sebagai penjualan bila lunas dan tidak dibatalkan */
function isSalesOrder(order) {
  return order.payment_status === PAYMENT_STATUS.PAID && order.order_status !== ORDER_STATUS.DIBATALKAN;
}

/** n kunci tanggal berurutan yang berakhir di endKey (inklusif), terlama dulu */
function lastNDateKeys(endKey, n) {
  return Array.from({ length: n }, (_, i) => addDaysToDateKey(endKey, i - (n - 1)));
}

/** Omzet & jumlah transaksi lunas per tanggal pesan (WIB) untuk daftar kunci tanggal */
function aggregateDailySales(orders, dateKeys) {
  const byDate = new Map(dateKeys.map((key) => [key, { date: key, cents: 0, orders: 0 }]));
  for (const order of orders) {
    if (!isSalesOrder(order)) continue;
    const bucket = byDate.get(getJakartaDateKey(new Date(order.created_at)));
    if (bucket) {
      bucket.cents += toCents(order.total);
      bucket.orders += 1;
    }
  }
  return dateKeys.map((key) => {
    const { date, cents, orders: count } = byDate.get(key);
    return { date, revenue: cents / 100, orders: count };
  });
}

/** Persentase perubahan dibulatkan; null bila pembanding nol */
function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Jumlah pesanan per status: semua status dari konstanta, nol bila tidak ada. counts = [{ status, count }] */
function countOrdersByStatus(counts) {
  const result = Object.fromEntries(Object.values(ORDER_STATUS).map((status) => [status, 0]));
  for (const { status, count } of counts) {
    if (status in result) result[status] += count;
  }
  return result;
}

/** Pesanan yang perlu diproses staf (KPI FR-27) dari hasil countOrdersByStatus */
function countNeedsProcessing(statusCounts) {
  return NEEDS_PROCESSING_STATUSES.reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0);
}

/** Bahan baku menipis: stok ≤ minimum (FR-32; sama dengan client rules/stock.js isLowStock) */
function isLowStock(material) {
  return toCents(material.stock) <= toCents(material.min_stock);
}

module.exports = {
  isSalesOrder,
  lastNDateKeys,
  aggregateDailySales,
  percentChange,
  countOrdersByStatus,
  countNeedsProcessing,
  isLowStock,
};
