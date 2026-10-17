// utils/rules/report.js
// Step 5.8 · FR-33 · UC-27 · AD-08 — laporan penjualan (fungsi murni)
// "Mengagregasi transaksi lunas per periode, produk terlaris, dan metode pembayaran" (FR-33).
// Transaksi = pesanan lunas & tidak dibatalkan (isSalesOrder) — definisi yang sama dengan Dashboard AD-02.

import { isSalesOrder, aggregateDailySales, getBestSellerTotals } from './sales';
import { addDaysToKey, dateKeyOf, parseDateKey } from '../date';
import { REPORT_PERIOD, REPORT_WEEK_DAYS, REPORT_MAX_RANGE_DAYS } from '../../constants/report';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Jumlah hari inklusif antara dua kunci tanggal */
export function daysBetweenInclusive(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000) + 1;
}

/** Semua kunci tanggal dari fromKey s.d. toKey (inklusif) */
export function dateKeysBetween(fromKey, toKey) {
  const n = daysBetweenInclusive(fromKey, toKey);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysToKey(fromKey, i));
}

/**
 * Rentang tanggal laporan dari periode pilihan (definisi di constants/report.js).
 * @param {{period, from?, to?}} filter
 * @param {string} todayKey
 * @returns {{from, to, error: string|null}} error diisi bila rentang khusus tidak sah
 */
export function resolveReportRange({ period, from, to }, todayKey) {
  if (period === REPORT_PERIOD.HARIAN) return { from: todayKey, to: todayKey, error: null };
  if (period === REPORT_PERIOD.BULANAN) return { from: `${todayKey.slice(0, 8)}01`, to: todayKey, error: null };
  if (period !== REPORT_PERIOD.RENTANG) {
    return { from: addDaysToKey(todayKey, -(REPORT_WEEK_DAYS - 1)), to: todayKey, error: null };
  }
  const invalid = (error) => ({ from: from ?? null, to: to ?? null, error });
  if (!DATE_KEY.test(from ?? '') || !DATE_KEY.test(to ?? '')) return invalid('Pilih tanggal mulai dan tanggal selesai');
  if (from > to) return invalid('Tanggal mulai harus sebelum atau sama dengan tanggal selesai');
  if (to > todayKey) return invalid('Tanggal selesai tidak boleh melewati hari ini');
  if (daysBetweenInclusive(from, to) > REPORT_MAX_RANGE_DAYS) return invalid(`Rentang maksimal ${REPORT_MAX_RANGE_DAYS} hari`);
  return { from, to, error: null };
}

/**
 * Laporan penjualan untuk rentang tanggal (berdasarkan tanggal pesanan dibuat, sama dengan Dashboard).
 * @param {object} t — tabel orders, order_items, payments, payment_methods, products, users
 * @param {{from, to, bestSellerLimit}} range
 * @returns {{kpi, daily, bestSellers, paymentMethods, transactions}}
 */
export function buildSalesReport(t, { from, to, bestSellerLimit }) {
  const keys = dateKeysBetween(from, to);
  const inRange = (o) => { const k = dateKeyOf(o.created_at); return k >= from && k <= to; };
  const sales = t.orders.filter((o) => isSalesOrder(o) && inRange(o));
  const salesIds = new Set(sales.map((o) => o.order_id));
  const items = t.order_items.filter((i) => salesIds.has(i.order_id));
  const revenue = sales.reduce((s, o) => s + o.total, 0);

  const methods = new Map(t.payment_methods.map((m) => [m.method_code, m]));
  const paymentOf = new Map(t.payments.map((p) => [p.order_id, p]));
  const products = new Map(t.products.map((p) => [p.product_id, p.name]));
  const users = new Map(t.users.map((u) => [u.user_id, u.name]));

  const byMethod = new Map();
  for (const order of sales) {
    const code = paymentOf.get(order.order_id)?.method_code ?? order.payment_option;
    const row = byMethod.get(code) ?? {
      method_code: code, name: methods.get(code)?.name ?? code, method_group: methods.get(code)?.method_group ?? null,
      transactions: 0, revenue: 0,
    };
    row.transactions += 1;
    row.revenue += order.total;
    byMethod.set(code, row);
  }

  return {
    kpi: {
      revenue,
      transactions: sales.length,
      average: sales.length ? Math.round(revenue / sales.length) : 0,
      itemsSold: items.reduce((s, i) => s + i.quantity, 0),
    },
    daily: aggregateDailySales(sales, keys),
    bestSellers: getBestSellerTotals(sales, items, keys, bestSellerLimit)
      .map((b) => ({ ...b, name: products.get(b.product_id) ?? `Produk #${b.product_id}` })),
    paymentMethods: [...byMethod.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
    transactions: [...sales]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({
        order_id: o.order_id,
        order_number: o.order_number,
        created_at: o.created_at,
        customer_name: users.get(o.user_id) ?? '-',
        fulfillment_type: o.fulfillment_type,
        method_name: byMethod.get(paymentOf.get(o.order_id)?.method_code ?? o.payment_option)?.name ?? '-',
        item_count: t.order_items.filter((i) => i.order_id === o.order_id).reduce((s, i) => s + i.quantity, 0),
        total: o.total,
      })),
  };
}
