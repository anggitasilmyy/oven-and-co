// utils/businessRules.js
// Step 4 · Aturan bisnis murni (tanpa side effect) — dipakai service mock, nanti dites di Step 7
// FR-05 · FR-22 · FR-27 · FR-32 · BR-01 · BR-09

import { AVAILABILITY_TYPE } from '../constants/product';
import { ORDER_STATUS, PAYMENT_STATUS, NEEDS_PROCESSING_STATUSES } from '../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT, MEMBER_LEVEL } from '../constants/storeConfig';
import { dateKeyOf } from './date';

// ── Stok (SPEC §8: sisa = qty_planned - qty_sold, tidak disimpan) ────────────

/** Sisa stok harian; tidak pernah negatif (validation rule Stok) */
export function getRemainingStock(dailyStock) {
  if (!dailyStock) return 0;
  return Math.max(0, dailyStock.qty_planned - dailyStock.qty_sold);
}

/**
 * Produk tampil di "Fresh from Oven Today" (FR-05, BR-01):
 * aktif, bertipe ready, dan punya sisa stok hari ini > 0.
 */
export function isFreshToday(product, todayStock) {
  return (
    product.is_active &&
    product.availability_type === AVAILABILITY_TYPE.READY &&
    getRemainingStock(todayStock) > 0
  );
}

/** Bahan baku menipis bila stok ≤ minimum (FR-32) */
export function isLowStock(material) {
  return Number(material.stock) <= Number(material.min_stock);
}

// ── Penjualan (FR-27) ─────────────────────────────────────────────────────────

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

// ── Ulasan ───────────────────────────────────────────────────────────────────

/** Rata-rata rating ulasan yang tidak disembunyikan; dibulatkan 1 desimal */
export function averageRating(reviews) {
  const visible = reviews.filter((r) => !r.is_hidden);
  if (visible.length === 0) return { average: null, count: 0 };
  const sum = visible.reduce((s, r) => s + r.rating, 0);
  return { average: Math.round((sum / visible.length) * 10) / 10, count: visible.length };
}

// ── Poin & level member (BR-09, TF-11) ───────────────────────────────────────

/** Saldo poin = Σ point_transactions.points (tidak disimpan sebagai kolom) */
export function getPointBalance(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.points, 0);
}

/** Poin yang diperoleh (earn + review_bonus) pada tahun kalender tertentu */
export function getYearlyEarnedPoints(transactions, year) {
  return transactions
    .filter((tx) => tx.points > 0 && (tx.type === 'earn' || tx.type === 'review_bonus'))
    .filter((tx) => new Date(tx.created_at).getFullYear() === year)
    .reduce((sum, tx) => sum + tx.points, 0);
}

/**
 * Level member dari poin tahunan: Silver < 500, Gold 500–1.999, Platinum ≥ 2.000.
 * @returns {{level, nextLevel, pointsToNext}}
 */
export function getMemberLevel(yearlyPoints, settings = STORE_SETTINGS_DEFAULT) {
  if (yearlyPoints >= settings.platinum_min_points) {
    return { level: MEMBER_LEVEL.PLATINUM, nextLevel: null, pointsToNext: 0 };
  }
  if (yearlyPoints >= settings.gold_min_points) {
    return {
      level: MEMBER_LEVEL.GOLD,
      nextLevel: MEMBER_LEVEL.PLATINUM,
      pointsToNext: settings.platinum_min_points - yearlyPoints,
    };
  }
  return {
    level: MEMBER_LEVEL.SILVER,
    nextLevel: MEMBER_LEVEL.GOLD,
    pointsToNext: settings.gold_min_points - yearlyPoints,
  };
}

/** Poin yang diperoleh dari total pesanan Selesai: 1 poin per Rp 1.000 */
export function pointsEarnedFor(total, settings = STORE_SETTINGS_DEFAULT) {
  return Math.floor(total / settings.earn_amount_per_point);
}

/** Nilai rupiah saldo poin bila ditukar (100 poin = Rp 5.000) */
export function pointsRedeemValue(points, settings = STORE_SETTINGS_DEFAULT) {
  return Math.floor(points / settings.redeem_points_unit) * settings.redeem_value;
}

// ── Promo ────────────────────────────────────────────────────────────────────

/** Voucher aktif pada tanggal tertentu: is_active, dalam periode, kuota tersisa */
export function isVoucherActiveOn(voucher, dateKey) {
  return voucher.is_active && voucher.quota > 0 && voucher.valid_from <= dateKey && dateKey <= voucher.valid_to;
}
