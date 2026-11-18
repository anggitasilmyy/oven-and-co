// services/mock/operationsReport.js
// CR-04c · FR-47 · UC-38 · BR-33 · AD-08 tab Operasional — pengganti GET /api/admin/reports/operations di mode mock.
// Urutan sama dengan API: sesi Owner (401/403, K18) → periode AD-08 (400, K16) → baca tabel mock (satu pembacaan, setara
// snapshot) → aturan murni yang sama dengan server (utils/rules/operationsReport.js) → 422 REPORT_AGGREGATE_LIMIT /
// 500 MILLI_PRECISION_LOST. Omzet pembanding = laporan penjualan AD-08 mock apa adanya; analisis = estimasi FR-40 hari ini.
// Hanya membaca — tidak menulis stok, buku mutasi, atau dokumen.

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { getMockUsers } from './users';
import { buildMaterialRequirements } from './materialRequirementAdmin';
import { createApiError } from '../../utils/apiErrors';
import { dateKeyOf } from '../../utils/date';
import { resolveReportRange, buildSalesReport } from '../../utils/businessRules';
import { buildOperationsReport } from '../../utils/rules/operationsReport';
import { MILLI_PRECISION_ERROR_CODE } from '../../utils/rules/recipe';
import { MILLI_PRECISION_LOST_TEXT } from '../../constants/recipe';
import { REPORT_PERIOD, REPORT_RECEIPT_MOVEMENT_TYPES } from '../../constants/report';
import { ROLES } from '../../constants/roles';
import useAuthStore from '../../stores/useAuthStore';

const id = (v) => String(v);
const text = (v) => String(v);

/** auth + requireRole('owner') server: tanpa sesi 401, peran lain 403 (pesan = middleware server) */
function requireOwnerSession() {
  const user = useAuthStore.getState().user;
  if (!user) throw createApiError('Autentikasi diperlukan.', 401);
  if (user.role !== ROLES.OWNER) throw createApiError('Anda tidak memiliki izin untuk mengakses resource ini.', 403);
}

/** validateReportQuery server: periode tidak dikenal → 400; kosong → mingguan */
function readFilter(filter) {
  const period = filter?.period || REPORT_PERIOD.MINGGUAN;
  if (!Object.values(REPORT_PERIOD).includes(period)) throw createApiError('Periode laporan tidak valid.', 400);
  return { period, from: filter?.from, to: filter?.to };
}

function loadInputs(from, to) {
  const t = getTables('purchase_orders', 'purchase_order_items', 'suppliers', 'raw_materials', 'material_movements', 'production_outputs',
    'work_orders', 'work_order_recipes', 'products');
  const inRange = (iso) => { if (!iso) return false; const k = dateKeyOf(iso); return k >= from && k <= to; };
  const materials = new Map(t.raw_materials.map((m) => [id(m.material_id), m]));
  const supplierName = new Map(t.suppliers.map((s) => [id(s.supplier_id), s.name]));
  const orders = new Map(t.purchase_orders.map((p) => [id(p.po_id), p]));
  const items = new Map(t.purchase_order_items.map((i) => [id(i.po_item_id), i]));
  const productName = new Map(t.products.map((p) => [id(p.product_id), p.name]));
  const purchaseRow = (i, qtyKey, qty) => {
    const po = orders.get(id(i.po_id));
    const m = materials.get(id(i.material_id));
    return { supplier_id: id(po.supplier_id), supplier_name: supplierName.get(id(po.supplier_id)), material_id: id(i.material_id), name: m.name, unit: m.unit, [qtyKey]: text(qty), unit_price: text(i.unit_price) };
  };
  const movementsInRange = t.material_movements.filter((v) => inRange(v.created_at));
  const outputs = t.production_outputs.filter((o) => inRange(o.recorded_at));
  const woById = new Map(t.work_orders.map((w) => [id(w.wo_id), w]));
  const woIds = new Set(outputs.map((o) => id(o.wo_id)));
  return {
    ordered: t.purchase_order_items.filter((i) => inRange(orders.get(id(i.po_id))?.ordered_at)).map((i) => purchaseRow(i, 'qty_ordered', i.qty_ordered)),
    cancelled: t.purchase_order_items.filter((i) => inRange(orders.get(id(i.po_id))?.cancelled_at) && Number(i.qty_cancelled) > 0)
      .map((i) => purchaseRow(i, 'qty_cancelled', i.qty_cancelled)),
    receipts: movementsInRange.filter((v) => REPORT_RECEIPT_MOVEMENT_TYPES.includes(v.type)).map((v) => {
      const row = purchaseRow(items.get(id(v.po_item_id)), 'qty_change', v.qty_change);
      return row;
    }),
    movements: movementsInRange.map((v) => {
      const m = materials.get(id(v.material_id));
      return { material_id: id(v.material_id), name: m.name, unit: m.unit, type: v.type, qty_change: text(v.qty_change) };
    }),
    outputs: outputs.map((o) => {
      const w = woById.get(id(o.wo_id));
      return { output_id: id(o.output_id), wo_id: id(o.wo_id), wo_number: w.wo_number, product_id: id(w.product_id), product_name: productName.get(id(w.product_id)), kind: o.kind, qty_output: Number(o.qty_output) };
    }),
    recipes: t.work_order_recipes.filter((r) => woIds.has(id(r.wo_id))).map((r) => ({ wo_id: id(r.wo_id), material_id: id(r.material_id), qty_per_unit: text(r.qty_per_unit) })),
    materials: t.raw_materials.map((m) => ({ material_id: id(m.material_id), name: m.name, unit: m.unit })),
    // Rencana: seluruh WO dengan production_date di periode, termasuk Dibatalkan (keputusan Pemilik Project CR-04c §9)
    plans: t.work_orders.filter((w) => w.production_date >= from && w.production_date <= to)
      .map((w) => ({ product_id: id(w.product_id), product_name: productName.get(id(w.product_id)), qty_planned: Number(w.qty_planned) })),
  };
}

/** @param {{period, from?, to?}} filter → bentuk respons sama dengan API */
export function buildOperationsReportForFilter(filter) {
  requireOwnerSession();
  const query = readFilter(filter);
  const todayKey = getMockTodayKey();
  const range = resolveReportRange(query, todayKey);
  if (range.error) throw createApiError(range.error, 400);
  const sales = getTables('orders', 'order_items', 'payments', 'payment_methods', 'products', 'store_settings');
  const { kpi } = buildSalesReport({ ...sales, users: getMockUsers() }, { ...range, bestSellerLimit: 0 });
  try {
    const report = buildOperationsReport({
      ...loadInputs(range.from, range.to),
      sales: { revenue_cents: BigInt(Math.round(kpi.revenue * 100)), transactions: kpi.transactions },
    });
    return {
      todayKey, store_name: sales.store_settings.store_name, period: query.period, from: range.from, to: range.to,
      ...report, analysis: { requirements: buildMaterialRequirements('') },
    };
  } catch (err) {
    if (err?.apiCode) throw createApiError(err.message, err.statusCode, err.apiCode);
    if (err?.code === MILLI_PRECISION_ERROR_CODE) throw createApiError(MILLI_PRECISION_LOST_TEXT, 500, MILLI_PRECISION_ERROR_CODE);
    throw err;
  }
}
