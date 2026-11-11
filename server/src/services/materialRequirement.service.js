// services/materialRequirement.service.js
// CR-03 CP5 · FR-40 · UC-32 · BR-14 – BR-16 · AD-07 — GET /api/admin/material-requirements?date=YYYY-MM-DD.
// Service ini HANYA mengambil data (satu snapshot REPEATABLE READ, pola AD-02/AD-08) lalu menyerahkan seluruh
// perhitungan ke aturan murni CP3 (materialRequirementRules.computeMaterialRequirements) — tidak ada perhitungan kedua.
// Tidak menulis apa pun (BR-15, AC-40.8). Klasifikasi tipe produk memakai availability_type saat ini (E-9).
// Error fail-safe presisi (MILLI_PRECISION_LOST) diteruskan ke errorHandler → 500 + kode + pesan aman.

const { AVAILABILITY_TYPE, MATERIAL_DEMAND_STATUSES } = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate, dbDateToKey } = require('../utils/jakartaDate');
const { runInReadSnapshot } = require('./readSnapshot.service');
const { resolveRequirementDate, computeMaterialRequirements } = require('./materialRequirementRules.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** Data mentah untuk tanggal target D (semua dibaca di snapshot yang sama) */
async function loadInputs(tx, todayKey, date) {
  const items = await tx.orderItem.findMany({
    where: {
      order: { is: { orderStatus: { in: [...MATERIAL_DEMAND_STATUSES] }, readyDate: { lte: dateKeyToDbDate(date) } } },
      product: { is: { availabilityType: { in: [AVAILABILITY_TYPE.PREORDER, AVAILABILITY_TYPE.CUSTOM] } } },
    },
    select: {
      productId: true, quantity: true,
      order: { select: { orderStatus: true, readyDate: true } },
      product: { select: { availabilityType: true } },
    },
  });
  const plans = await tx.dailyStock.findMany({
    where: { stockDate: dateKeyToDbDate(todayKey), product: { is: { availabilityType: AVAILABILITY_TYPE.READY } } },
    select: { productId: true, stockDate: true, qtyPlanned: true, product: { select: { availabilityType: true } } },
  });
  const recipes = await tx.productMaterial.findMany({ select: { productId: true, materialId: true, qtyPerUnit: true } });
  const materials = await tx.rawMaterial.findMany({ orderBy: { materialId: 'asc' } });
  const productIds = [...new Set([...items, ...plans].map((r) => r.productId))];
  const products = productIds.length
    ? await tx.product.findMany({ where: { productId: { in: productIds } }, select: { productId: true, name: true } })
    : [];
  return { items, plans, recipes, materials, products };
}

/** GET /api/admin/material-requirements — bentuk respons CR-03 §B7.3 */
async function getMaterialRequirements(query = {}, now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  const resolved = resolveRequirementDate(query.date, todayKey);
  if (resolved.error) throw httpError(400, resolved.error);
  const { date } = resolved;
  const data = await runInReadSnapshot((tx) => loadInputs(tx, todayKey, date));
  return computeMaterialRequirements({
    todayKey,
    date,
    orderItems: data.items.map((i) => ({
      product_id: String(i.productId), availability_type: i.product.availabilityType, order_status: i.order.orderStatus,
      ready_date: dbDateToKey(i.order.readyDate), quantity: i.quantity,
    })),
    readyPlans: data.plans.map((p) => ({
      product_id: String(p.productId), availability_type: p.product.availabilityType, stock_date: dbDateToKey(p.stockDate),
      qty_planned: p.qtyPlanned,
    })),
    recipes: data.recipes.map((r) => ({ product_id: String(r.productId), material_id: String(r.materialId), qty_per_unit: String(r.qtyPerUnit) })),
    materials: data.materials.map((m) => ({
      material_id: String(m.materialId), name: m.name, unit: m.unit, stock: String(m.stock), min_stock: String(m.minStock),
    })),
    productNames: Object.fromEntries(data.products.map((p) => [String(p.productId), p.name])),
  });
}

module.exports = {
  getMaterialRequirements,
};
