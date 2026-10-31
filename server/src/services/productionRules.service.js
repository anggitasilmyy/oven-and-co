// services/productionRules.service.js
// FR-29 · UC-22 · BR-02 · BR-03 · AD-05 Kalender Produksi — pengelompokan produksi per tanggal siap (fungsi murni).
// Port server dari client/src/utils/rules/production.js (buildProductionEntries, countProductionByDate,
// groupProductionList, monthKeyOf, buildMonthGrid) dengan perilaku sama. Item pre-order & custom cake dikelompokkan
// berdasarkan orders.ready_date (pesanan campuran siap pada tanggal item terlama, BR-03); item ready tidak masuk
// kalender karena disiapkan dari stok harian.

const { AVAILABILITY_TYPE, PRODUCTION_STATUSES } = require('../utils/businessConstants');
const { addDaysToDateKey } = require('../utils/jakartaDate');

const PRODUCTION_TYPES = Object.freeze([AVAILABILITY_TYPE.PREORDER, AVAILABILITY_TYPE.CUSTOM]);

/**
 * Baris produksi: satu per item pre-order/custom dari pesanan berstatus PRODUCTION_STATUSES.
 * @param {Array<{date, order_number, order_status, fulfillment_type, time_slot, product_id, availability_type, quantity, design_id}>} items
 *   item pesanan yang sudah diratakan (urut order_item_id)
 */
function buildProductionEntries(items) {
  return items.filter((i) => PRODUCTION_STATUSES.includes(i.order_status) && PRODUCTION_TYPES.includes(i.availability_type));
}

/**
 * Pill per tanggal (PRD Batch 6): jumlah PESANAN pre-order dan custom cake. Pesanan yang memuat keduanya dihitung di keduanya.
 * @returns {Record<string, {preorder: number, custom: number}>}
 */
function countProductionByDate(entries) {
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
function groupProductionList(entries, dateKey) {
  const groups = new Map();
  for (const e of entries.filter((x) => x.date === dateKey)) {
    const key = e.design_id ? `design-${e.design_id}` : `product-${e.product_id}`;
    const g = groups.get(key) ?? {
      key, product_id: e.product_id, design_id: e.design_id, availability_type: e.availability_type, quantity: 0, orders: [],
    };
    g.quantity += e.quantity;
    const existing = g.orders.find((o) => o.order_number === e.order_number);
    if (existing) existing.quantity += e.quantity;
    else {
      g.orders.push({
        order_number: e.order_number, order_status: e.order_status, quantity: e.quantity, time_slot: e.time_slot, fulfillment_type: e.fulfillment_type,
      });
    }
    groups.set(key, g);
  }
  // Pre-order dulu lalu custom cake; jumlah terbanyak di atas
  return [...groups.values()].sort((a, b) =>
    (a.availability_type === b.availability_type ? 0 : a.availability_type === AVAILABILITY_TYPE.CUSTOM ? 1 : -1) || b.quantity - a.quantity);
}

/** "YYYY-MM" dari kunci tanggal */
const monthKeyOf = (dateKey) => dateKey.slice(0, 7);

/**
 * Grid bulan (minggu dimulai Senin): array minggu berisi 7 kunci tanggal; tanggal di luar bulan tetap diisi
 * agar grid rata, ditandai lewat inMonth (nama field = kontrak client).
 * @returns {Array<Array<{date: string, inMonth: boolean}>>}
 */
function buildMonthGrid(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // Senin = 0
  const start = addDaysToDateKey(`${monthKey}-01`, -startOffset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((startOffset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (__, d) => {
    const date = addDaysToDateKey(start, w * 7 + d);
    return { date, inMonth: monthKeyOf(date) === monthKey };
  }));
}

module.exports = {
  buildProductionEntries,
  countProductionByDate,
  groupProductionList,
  monthKeyOf,
  buildMonthGrid,
};
