// services/mock/productionViews.js
// Step 5.6 · FR-29 · UC-22 · AD-05 Kalender Produksi — data kalender dari pesanan yang tersimpan (tanpa tabel terpisah)
// Pengganti GET /api/admin/calendar (Step 6.4). Status pesanan dibaca langsung dari tabel orders, jadi perubahan
// status di AD-04 langsung tercermin tanpa salinan data.

import { getTables } from './db';
import { requireMockRole } from './mockSession';
import { getMockTodayKey } from './mockClock';
import { ADMIN_ROLES } from './adminOrderViews';
import {
  buildProductionEntries, countProductionByDate, groupProductionList, buildMonthGrid, monthKeyOf,
} from '../../utils/businessRules';

const PRODUCTION_TABLES = [
  'orders', 'order_items', 'products', 'custom_cake_designs', 'custom_cake_design_options', 'custom_options',
];

/** Ringkasan desain custom cake untuk daftar produksi, mis. "Diameter 20 cm · Bulat · Cokelat · Buttercream" */
function designLabel(designId, t) {
  const design = t.custom_cake_designs.find((d) => d.design_id === designId);
  if (!design) return null;
  const ids = new Set(t.custom_cake_design_options.filter((o) => o.design_id === designId).map((o) => o.option_id));
  const names = t.custom_options.filter((o) => ids.has(o.option_id)).map((o) => o.name);
  return [names.join(' · '), design.writing_text ? `Tulisan "${design.writing_text}"` : null].filter(Boolean).join(' · ');
}

/**
 * Bulan & tanggal kosong → bulan/tanggal hari ini (mock). Bulan tanpa tanggal → hari ini bila ada di bulan itu,
 * selain itu tanggal 1, sehingga panel daftar selalu berada di bulan yang ditampilkan.
 * @param {string|null} monthKey — "YYYY-MM"
 * @param {string|null} dateKey — tanggal terpilih "YYYY-MM-DD"
 * @returns {{month_key, today_key, weeks, counts, selected: {date, groups}}}
 */
export function buildProductionCalendar(monthKey, dateKey) {
  requireMockRole(...ADMIN_ROLES);
  const todayKey = getMockTodayKey();
  const month = monthKey || monthKeyOf(dateKey || todayKey);
  const fallbackDate = monthKeyOf(todayKey) === month ? todayKey : `${month}-01`;
  const date = dateKey && monthKeyOf(dateKey) === month ? dateKey : fallbackDate;
  const t = getTables(...PRODUCTION_TABLES);
  const entries = buildProductionEntries({ orders: t.orders, orderItems: t.order_items, products: t.products });
  const weeks = buildMonthGrid(month);
  const visible = new Set(weeks.flat().map((d) => d.date));
  const counts = Object.fromEntries(Object.entries(countProductionByDate(entries)).filter(([d]) => visible.has(d)));
  const productName = new Map(t.products.map((p) => [p.product_id, p.name]));
  return {
    month_key: month,
    today_key: todayKey,
    weeks,
    counts,
    selected: {
      date,
      groups: groupProductionList(entries, date).map((g) => ({
        ...g, name: productName.get(g.product_id) ?? 'Produk', design_label: g.design_id ? designLabel(g.design_id, t) : null,
      })),
    },
  };
}
