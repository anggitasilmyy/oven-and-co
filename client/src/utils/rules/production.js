// utils/rules/production.js
// Step 5.6 · FR-29 · UC-22 · BR-02 · BR-03 · AD-05 Kalender Produksi — pengelompokan produksi per tanggal siap (fungsi murni)
// Item pre-order & custom cake dikelompokkan berdasarkan orders.ready_date (pesanan campuran siap pada tanggal item
// terlama, BR-03). Item ready tidak masuk kalender karena disiapkan dari stok harian.

import { AVAILABILITY_TYPE } from '../../constants/product';
import { PRODUCTION_STATUSES } from '../../constants/adminOrder';
import { addDaysToKey, parseDateKey, toDateKey } from '../date';

const PRODUCTION_TYPES = [AVAILABILITY_TYPE.PREORDER, AVAILABILITY_TYPE.CUSTOM];

/**
 * Baris produksi: satu per item pre-order/custom dari pesanan yang dihitung produksi (PRODUCTION_STATUSES).
 * @param {{orders: Array, orderItems: Array, products: Array}} t
 * @returns {Array<{date, order_number, order_status, fulfillment_type, time_slot, product_id, availability_type, quantity, design_id}>}
 */
export function buildProductionEntries({ orders, orderItems, products }) {
  const typeOf = new Map(products.map((p) => [p.product_id, p.availability_type]));
  const active = new Map(orders.filter((o) => PRODUCTION_STATUSES.includes(o.order_status)).map((o) => [o.order_id, o]));
  return orderItems
    .filter((i) => active.has(i.order_id) && PRODUCTION_TYPES.includes(typeOf.get(i.product_id)))
    .map((i) => {
      const o = active.get(i.order_id);
      return {
        date: o.ready_date, order_number: o.order_number, order_status: o.order_status,
        fulfillment_type: o.fulfillment_type, time_slot: o.time_slot,
        product_id: i.product_id, availability_type: typeOf.get(i.product_id), quantity: i.quantity, design_id: i.design_id ?? null,
      };
    });
}

/**
 * Pill per tanggal (PRD Batch 6): jumlah PESANAN pre-order dan custom cake. Pesanan yang memuat keduanya dihitung di keduanya.
 * @returns {Record<string, {preorder: number, custom: number}>}
 */
export function countProductionByDate(entries) {
  const sets = {};
  for (const e of entries) {
    sets[e.date] ??= { preorder: new Set(), custom: new Set() };
    sets[e.date][e.availability_type === AVAILABILITY_TYPE.CUSTOM ? 'custom' : 'preorder'].add(e.order_number);
  }
  return Object.fromEntries(Object.entries(sets).map(([d, s]) => [d, { preorder: s.preorder.size, custom: s.custom.size }]));
}

/**
 * Daftar produksi satu tanggal, dikelompokkan per produk (custom cake per desain karena isinya berbeda).
 * @returns {Array<{key, product_id, design_id, availability_type, quantity, orders: Array<{order_number, order_status, quantity, time_slot, fulfillment_type}>}>}
 */
export function groupProductionList(entries, dateKey) {
  const groups = new Map();
  for (const e of entries.filter((x) => x.date === dateKey)) {
    const key = e.design_id ? `design-${e.design_id}` : `product-${e.product_id}`;
    const g = groups.get(key) ?? {
      key, product_id: e.product_id, design_id: e.design_id, availability_type: e.availability_type, quantity: 0, orders: [],
    };
    g.quantity += e.quantity;
    const existing = g.orders.find((o) => o.order_number === e.order_number);
    if (existing) existing.quantity += e.quantity;
    else g.orders.push({ order_number: e.order_number, order_status: e.order_status, quantity: e.quantity, time_slot: e.time_slot, fulfillment_type: e.fulfillment_type });
    groups.set(key, g);
  }
  // Pre-order dulu lalu custom cake; jumlah terbanyak di atas
  return [...groups.values()].sort((a, b) =>
    (a.availability_type === b.availability_type ? 0 : a.availability_type === AVAILABILITY_TYPE.CUSTOM ? 1 : -1) || b.quantity - a.quantity);
}

/** "YYYY-MM" dari kunci tanggal */
export const monthKeyOf = (dateKey) => dateKey.slice(0, 7);

/** Geser bulan: shiftMonthKey('2026-12', 1) → '2027-01' */
export function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Grid bulan (minggu dimulai Senin): array minggu berisi 7 kunci tanggal; tanggal di luar bulan tetap diisi
 * agar grid rata, ditandai lewat inMonth.
 * @returns {Array<Array<{date: string, inMonth: boolean}>>}
 */
export function buildMonthGrid(monthKey) {
  const first = parseDateKey(`${monthKey}-01`);
  const startOffset = (first.getDay() + 6) % 7; // Senin = 0
  const start = addDaysToKey(toDateKey(first), -startOffset);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((startOffset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (__, d) => {
    const date = addDaysToKey(start, w * 7 + d);
    return { date, inMonth: monthKeyOf(date) === monthKey };
  }));
}
