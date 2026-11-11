// services/mock/materialRequirementAdmin.js
// CR-03 CP7 · FR-40 · UC-32 · BR-14 – BR-16 · AD-07 — pengganti GET /api/admin/material-requirements di mode mock.
// Hanya menyiapkan data dari tabel mock lalu memanggil aturan murni yang sama dengan server
// (utils/rules/materialRequirement.js = port services/materialRequirementRules.service.js) — tidak ada perhitungan kedua.
// Tidak menulis apa pun (BR-15). Error mengikuti kontrak §B7.3: 400 tanggal, 500 MILLI_PRECISION_LOST (SPEC §5).

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { createApiError } from '../../utils/apiErrors';
import { resolveRequirementDate, computeMaterialRequirements } from '../../utils/rules/materialRequirement';
import { MILLI_PRECISION_ERROR_CODE } from '../../utils/rules/recipe';
import { MILLI_PRECISION_LOST_TEXT } from '../../constants/recipe';

/** @param {string} dateParam — YYYY-MM-DD atau kosong (hari ini) */
export function buildMaterialRequirements(dateParam) {
  const todayKey = getMockTodayKey();
  const resolved = resolveRequirementDate(dateParam, todayKey);
  if (resolved.error) throw createApiError(resolved.error, 400);
  const t = getTables('orders', 'order_items', 'products', 'daily_stocks', 'product_materials', 'raw_materials');
  const productById = new Map(t.products.map((p) => [String(p.product_id), p]));
  const orderById = new Map(t.orders.map((o) => [o.order_id, o]));
  const orderItems = t.order_items.flatMap((item) => {
    const order = orderById.get(item.order_id);
    const product = productById.get(String(item.product_id));
    if (!order || !product) return [];
    return [{
      product_id: String(item.product_id), availability_type: product.availability_type, order_status: order.order_status,
      ready_date: order.ready_date, quantity: item.quantity,
    }];
  });
  const readyPlans = t.daily_stocks.flatMap((s) => {
    const product = productById.get(String(s.product_id));
    return product ? [{ product_id: String(s.product_id), availability_type: product.availability_type, stock_date: s.stock_date, qty_planned: s.qty_planned }] : [];
  });
  try {
    return computeMaterialRequirements({
      todayKey,
      date: resolved.date,
      orderItems,
      readyPlans,
      recipes: t.product_materials.map((r) => ({ product_id: String(r.product_id), material_id: String(r.material_id), qty_per_unit: String(r.qty_per_unit) })),
      materials: t.raw_materials.map((m) => ({
        material_id: String(m.material_id), name: m.name, unit: m.unit, stock: String(m.stock), min_stock: String(m.min_stock),
      })),
      productNames: Object.fromEntries(t.products.map((p) => [String(p.product_id), p.name])),
    });
  } catch (err) {
    if (err?.code === MILLI_PRECISION_ERROR_CODE) throw createApiError(MILLI_PRECISION_LOST_TEXT, 500, MILLI_PRECISION_ERROR_CODE);
    throw err;
  }
}
