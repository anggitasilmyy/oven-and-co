// services/reportRules.service.js
// Step 6.4.7 · FR-33 · UC-27 · A-08 · AD-08 — aturan murni laporan penjualan, port dari client utils/rules/report.js.
// "Mengagregasi transaksi lunas per periode, produk terlaris, dan metode pembayaran" (FR-33). Transaksi = pesanan lunas &
// tidak dibatalkan (salesRules.service.js isSalesOrder) — definisi yang sama dengan Dashboard AD-02. Tanggal = WIB.
// Rupiah dijumlah dalam sen. Ekspor Excel/PDF (UC-28) dibuat di peramban dari hasil yang sama (client utils/reportExport.js).

const { REPORT_PERIOD, REPORT_WEEK_DAYS, REPORT_MAX_RANGE_DAYS } = require('../utils/businessConstants');
const { addDaysToDateKey, getJakartaDateKey, isValidDateKey } = require('../utils/jakartaDate');
const { isSalesOrder, aggregateDailySales } = require('./salesRules.service');

const DATE_KEY = /^[1-9]\d{3}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const toCents = (value) => Math.round(Number(value) * 100);
const isDateKey = (value) => typeof value === 'string' && DATE_KEY.test(value) && isValidDateKey(value);

/** Jumlah hari inklusif antara dua kunci tanggal */
function daysBetweenInclusive(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Semua kunci tanggal dari fromKey s.d. toKey (inklusif) */
function dateKeysBetween(fromKey, toKey) {
  const n = daysBetweenInclusive(fromKey, toKey);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysToDateKey(fromKey, i));
}

/**
 * Rentang tanggal laporan dari periode (sama dengan client resolveReportRange; pesan error sama).
 * @param {{period, from?, to?}} filter — period sudah divalidasi (validators/adminReport.validator.js)
 * @returns {{from, to, error: string|null}}
 */
function resolveReportRange({ period, from, to }, todayKey) {
  if (period === REPORT_PERIOD.HARIAN) return { from: todayKey, to: todayKey, error: null };
  if (period === REPORT_PERIOD.BULANAN) return { from: `${todayKey.slice(0, 8)}01`, to: todayKey, error: null };
  if (period !== REPORT_PERIOD.RENTANG) {
    return { from: addDaysToDateKey(todayKey, -(REPORT_WEEK_DAYS - 1)), to: todayKey, error: null };
  }
  const invalid = (error) => ({ from: from ?? null, to: to ?? null, error });
  if (!isDateKey(from) || !isDateKey(to)) return invalid('Pilih tanggal mulai dan tanggal selesai');
  if (from > to) return invalid('Tanggal mulai harus sebelum atau sama dengan tanggal selesai');
  if (to > todayKey) return invalid('Tanggal selesai tidak boleh melewati hari ini');
  if (daysBetweenInclusive(from, to) > REPORT_MAX_RANGE_DAYS) return invalid(`Rentang maksimal ${REPORT_MAX_RANGE_DAYS} hari`);
  return { from, to, error: null };
}

/** Kode metode transaksi: metode pembayaran terbaru, atau payment_option bila tidak ada baris payments (sama dengan mock) */
const methodCodeOf = (order) => order.method_code ?? order.payment_option;

/**
 * Laporan penjualan untuk rentang tanggal (tanggal pesanan dibuat, WIB).
 * @param {{orders, methods, productNames}} t
 *   orders: [{ order_id, order_number, created_at, total, payment_status, order_status, fulfillment_type, payment_option,
 *              customer_name, method_code, items: [{ product_id, quantity }] }]
 *   methods: Map method_code → { name, method_group }; productNames: Map product_id → nama
 * @param {{from, to, bestSellerLimit}} range
 * @returns {{kpi, daily, bestSellers, paymentMethods, transactions}}
 */
function buildSalesReport({ orders, methods, productNames }, { from, to, bestSellerLimit }) {
  const keys = dateKeysBetween(from, to);
  const inRange = (o) => { const k = getJakartaDateKey(new Date(o.created_at)); return k >= from && k <= to; };
  const sales = orders.filter((o) => isSalesOrder(o) && inRange(o));
  const quantityOf = (o) => o.items.reduce((sum, i) => sum + i.quantity, 0);
  const revenueCents = sales.reduce((sum, o) => sum + toCents(o.total), 0);

  const byMethod = new Map();
  const byProduct = new Map();
  for (const order of sales) {
    const code = methodCodeOf(order);
    const row = byMethod.get(code) ?? {
      method_code: code, name: methods.get(code)?.name ?? code, method_group: methods.get(code)?.method_group ?? null, transactions: 0, cents: 0,
    };
    row.transactions += 1;
    row.cents += toCents(order.total);
    byMethod.set(code, row);
    for (const item of order.items) byProduct.set(item.product_id, (byProduct.get(item.product_id) ?? 0) + item.quantity);
  }

  const byId = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
  return {
    kpi: {
      revenue: revenueCents / 100,
      transactions: sales.length,
      average: sales.length ? Math.round(revenueCents / sales.length / 100) : 0,
      itemsSold: sales.reduce((sum, o) => sum + quantityOf(o), 0),
    },
    daily: aggregateDailySales(sales, keys),
    bestSellers: [...byProduct.entries()]
      .map(([product_id, quantity]) => ({ product_id, quantity, name: productNames.get(product_id) ?? `Produk #${product_id}` }))
      .sort((a, b) => b.quantity - a.quantity || byId(a.product_id, b.product_id))
      .slice(0, bestSellerLimit),
    paymentMethods: [...byMethod.values()]
      .map(({ cents, ...row }) => ({ ...row, revenue: cents / 100 }))
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
    transactions: [...sales]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || byId(b.order_id, a.order_id))
      .map((o) => ({
        order_id: o.order_id,
        order_number: o.order_number,
        created_at: new Date(o.created_at).toISOString(),
        customer_name: o.customer_name ?? '-',
        fulfillment_type: o.fulfillment_type,
        method_name: byMethod.get(methodCodeOf(o)).name,
        item_count: quantityOf(o),
        total: o.total,
      })),
  };
}

module.exports = {
  daysBetweenInclusive,
  dateKeysBetween,
  resolveReportRange,
  buildSalesReport,
};
