// services/operationsReport.service.js
// CR-04c · FR-47 · UC-38 · BR-33 · AD-08 tab Operasional (Owner, K18) — GET /api/admin/reports/operations.
// Periode = aturan AD-08 (K16: validators/adminReport.validator + reportRules.resolveReportRange). Seluruh sumber dibaca
// dalam SATU runInReadSnapshot (§9), termasuk getSalesOrders AD-08 (omzet pembanding) & estimasi FR-40 (K19); hanya
// membaca — tidak menulis stok, buku mutasi, atau dokumen. Perhitungan seluruhnya di operationsReportRules (aturan murni).
// Dasar tanggal (WIB, §9): PO dipesan `ordered_at`; sisa dibatalkan `cancelled_at`; mutasi (penerimaan, pengeluaran, dst)
// `created_at`; hasil produksi & standar `recorded_at`; rencana `production_date` (termasuk WO Dibatalkan). Nilai DECIMAL dibaca sebagai teks.

const { REPORT_RECEIPT_MOVEMENT_TYPES } = require('../utils/businessConstants');
const { getJakartaDateKey, getJakartaDayRange, dateKeyToDbDate } = require('../utils/jakartaDate');
const { resolveReportRange, buildSalesReport } = require('./reportRules.service');
const { runInReadSnapshot } = require('./readSnapshot.service');
const { getSalesOrders } = require('./salesReport.service');
const { getMaterialRequirementsInSnapshot } = require('./materialRequirement.service');
const { buildOperationsReport } = require('./operationsReportRules.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const text = (v) => v.toString();
const id = (v) => String(v);
const materialSelect = { select: { name: true, unit: true } };
const poSelect = { select: { supplierId: true, supplier: { select: { name: true } } } };

async function loadPurchases(tx, range) {
  const toRow = (i, qtyKey, qty) => ({
    supplier_id: id(i.purchaseOrder.supplierId), supplier_name: i.purchaseOrder.supplier.name, material_id: id(i.materialId),
    name: i.material.name, unit: i.material.unit, [qtyKey]: text(qty), unit_price: text(i.unitPrice),
  });
  const ordered = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrder: { is: { orderedAt: range } } }, include: { purchaseOrder: poSelect, material: materialSelect },
  });
  const cancelled = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrder: { is: { cancelledAt: range } }, qtyCancelled: { gt: 0 } }, include: { purchaseOrder: poSelect, material: materialSelect },
  });
  const receipts = await tx.materialMovement.findMany({
    where: { type: { in: [...REPORT_RECEIPT_MOVEMENT_TYPES] }, createdAt: range },
    include: { material: materialSelect, poItem: { select: { unitPrice: true, purchaseOrder: poSelect } } },
  });
  return {
    ordered: ordered.map((i) => toRow(i, 'qty_ordered', i.qtyOrdered)),
    cancelled: cancelled.map((i) => toRow(i, 'qty_cancelled', i.qtyCancelled)),
    receipts: receipts.map((m) => ({
      supplier_id: id(m.poItem.purchaseOrder.supplierId), supplier_name: m.poItem.purchaseOrder.supplier.name, material_id: id(m.materialId),
      name: m.material.name, unit: m.material.unit, qty_change: text(m.qtyChange), unit_price: text(m.poItem.unitPrice),
    })),
  };
}

async function loadProduction(tx, range, from, to) {
  const outputs = await tx.productionOutput.findMany({
    where: { recordedAt: range },
    include: { workOrder: { select: { woNumber: true, productId: true, product: { select: { name: true } } } } },
  });
  const woIds = [...new Set(outputs.map((o) => o.woId))];
  const recipes = woIds.length ? await tx.workOrderRecipe.findMany({ where: { woId: { in: woIds } } }) : [];
  const plans = await tx.workOrder.findMany({
    // Rencana = seluruh WO dengan production_date di periode, TERMASUK WO Dibatalkan (keputusan Pemilik Project CR-04c §9)
    where: { productionDate: { gte: dateKeyToDbDate(from), lte: dateKeyToDbDate(to) } },
    select: { productId: true, qtyPlanned: true, product: { select: { name: true } } },
  });
  return {
    outputs: outputs.map((o) => ({
      output_id: id(o.outputId), wo_id: id(o.woId), wo_number: o.workOrder.woNumber, product_id: id(o.workOrder.productId),
      product_name: o.workOrder.product.name, kind: o.kind, qty_output: o.qtyOutput,
    })),
    recipes: recipes.map((r) => ({ wo_id: id(r.woId), material_id: id(r.materialId), qty_per_unit: text(r.qtyPerUnit) })),
    plans: plans.map((w) => ({ product_id: id(w.productId), product_name: w.product.name, qty_planned: w.qtyPlanned })),
  };
}

/**
 * GET /api/admin/reports/operations
 * @param {{period, from?, to?}} filter — validators/adminReport.validator.js (sama dengan AD-08)
 */
async function getOperationsReport(filter, now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  const resolved = resolveReportRange(filter, todayKey);
  if (resolved.error) throw httpError(400, resolved.error);
  const { from, to } = resolved;
  const range = getJakartaDayRange(from, to);

  const data = await runInReadSnapshot(async (tx) => {
    const settings = await tx.storeSetting.findFirst({ orderBy: { settingId: 'asc' }, select: { storeName: true } });
    const purchases = await loadPurchases(tx, range);
    const movements = await tx.materialMovement.findMany({ where: { createdAt: range }, include: { material: materialSelect } });
    const production = await loadProduction(tx, range, from, to);
    const materials = await tx.rawMaterial.findMany({ select: { materialId: true, name: true, unit: true } });
    const orders = await getSalesOrders(tx, from, to);
    const requirements = await getMaterialRequirementsInSnapshot(tx, todayKey);
    return { settings, purchases, movements, production, materials, orders, requirements };
  });

  // Omzet pembanding: aturan AD-08 apa adanya (buildSalesReport.kpi pada pesanan getSalesOrders yang sama)
  const { kpi } = buildSalesReport({ orders: data.orders, methods: new Map(), productNames: new Map() }, { from, to, bestSellerLimit: 0 });
  const report = buildOperationsReport({
    ...data.purchases,
    movements: data.movements.map((m) => ({
      material_id: id(m.materialId), name: m.material.name, unit: m.material.unit, type: m.type, qty_change: text(m.qtyChange),
    })),
    ...data.production,
    materials: data.materials.map((m) => ({ material_id: id(m.materialId), name: m.name, unit: m.unit })),
    sales: { revenue_cents: BigInt(Math.round(kpi.revenue * 100)), transactions: kpi.transactions },
  });
  return {
    todayKey, store_name: data.settings?.storeName ?? '', period: filter.period, from, to,
    ...report,
    analysis: { requirements: data.requirements },
  };
}

module.exports = { getOperationsReport };
