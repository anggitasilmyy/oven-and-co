// services/mock/workOrderAdmin.js
// CR-04b · FR-45 · UC-36 · BR-25, BR-27, BR-31 · K10, K14 · AD-13 — pengganti workOrder.service & workOrderView.service
// server di mode mock: daftar & detail WO, buat (Draft, nomor WO-YYMMDD-NNN), ubah Draft, transisi {from, to} (mulai:
// salin product_materials ke snapshot + recipe_snapshot_at, juga bila kosong; batal), dan isian awal hanya-baca dari
// AD-07 (rencana ready hari ini) & AD-05 (kalender produksi) — tanpa menulis. Aturan murni sama dengan server.

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { runMockOperation, nextId, nowIso, loadLedgerTables } from './ledgerMock';
import { workOrderView, workOrderList } from './workOrderData';
import { buildDailyStockBoard } from './stockAdmin';
import { buildProductionCalendar } from './productionViews';
import { validateWorkOrder, workOrderTransitionError, nextWorkOrderNumber } from '../../utils/rules/workOrder';
import { getRequirementWindow, isValidDateKey } from '../../utils/rules/materialRequirement';
import { WO_STATUS } from '../../constants/workOrder';
import { createApiError } from '../../utils/apiErrors';

const WO_NOT_FOUND = 'Work order tidak ditemukan.';
const same = (a, b) => String(a) === String(b);
const notFound = () => createApiError(WO_NOT_FOUND, 404);

export function workTables() {
  const ledger = loadLedgerTables();
  const t = getTables('products', 'product_materials', 'work_orders', 'work_order_recipes', 'material_issues', 'material_issue_lines', 'production_outputs');
  return { ...t, raw_materials: ledger.raw_materials, material_movements: ledger.material_movements, material_issues: ledger.material_issues, material_issue_lines: ledger.material_issue_lines };
}

export function lockWorkOrder(t, woId) {
  const wo = t.work_orders.find((w) => same(w.wo_id, woId));
  if (!wo) throw notFound();
  return wo;
}

function validWorkOrder(t, input) {
  const products = new Map(t.products.map((p) => [String(p.product_id), { is_active: Boolean(p.is_active) }]));
  const { errors, value } = validateWorkOrder(input, { products, todayKey: getMockTodayKey() });
  if (Object.keys(errors).length) throw createApiError(Object.values(errors)[0], 400, undefined, { fieldErrors: errors });
  return value;
}

const payload = (input) => ({
  product_id: input.product_id ?? null, production_date: input.production_date ?? null, qty_planned: input.qty_planned ?? null, note: input.note ?? null,
});
const changed = (t) => ({ work_orders: t.work_orders, work_order_recipes: t.work_order_recipes });

export const listWorkOrders = () => workOrderList(workTables());

export function getWorkOrder(woId) {
  const t = workTables();
  lockWorkOrder(t, woId);
  return workOrderView(t, woId);
}

export function createWorkOrder(actor, input, { requestId }) {
  return runMockOperation({ requestId, actorId: actor.user_id, operation: 'create_work_order', payload: payload(input), successStatus: 201 }, () => {
    const t = workTables();
    const value = validWorkOrder(t, input);
    const at = nowIso();
    const woId = nextId(t.work_orders, 'wo_id');
    t.work_orders = [...t.work_orders, {
      wo_id: woId, wo_number: nextWorkOrderNumber(t.work_orders.map((w) => w.wo_number), getMockTodayKey()), product_id: Number(value.product_id),
      production_date: value.production_date, qty_planned: value.qty_planned, status: WO_STATUS.DRAFT, note: value.note,
      recipe_snapshot_at: null, started_at: null, completed_at: null, cancelled_at: null,
      created_by: actor.user_id, created_request_id: requestId, created_at: at, updated_at: at,
    }];
    return { data: workOrderView(t, woId), tables: changed(t) };
  });
}

export function updateWorkOrder(actor, woId, input, { requestId } = {}) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'update_work_order', targetType: 'work_order', targetId: String(woId), payload: payload(input), successStatus: 200,
  }, () => {
    const t = workTables();
    const wo = lockWorkOrder(t, woId);
    if (wo.status !== WO_STATUS.DRAFT) throw createApiError('WO hanya dapat diubah saat berstatus Draft.', 409);
    const value = validWorkOrder(t, input);
    t.work_orders = t.work_orders.map((w) => (same(w.wo_id, woId) ? {
      ...w, product_id: Number(value.product_id), production_date: value.production_date, qty_planned: value.qty_planned, note: value.note, updated_at: nowIso(),
    } : w));
    return { data: workOrderView(t, woId), tables: changed(t) };
  });
}

export function transitionWorkOrder(actor, woId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'transition_work_order', targetType: 'work_order', targetId: String(woId),
    payload: { from: input.from, to: input.to }, successStatus: 200,
  }, () => {
    const t = workTables();
    const wo = lockWorkOrder(t, woId);
    const conflict = workOrderTransitionError(wo.status, input.from, input.to);
    if (conflict) throw createApiError(conflict.message, conflict.status);
    const at = nowIso();
    if (input.to === WO_STATUS.DIPROSES) {
      const recipe = t.product_materials.filter((r) => same(r.product_id, wo.product_id))
        .map((r) => ({ wo_id: wo.wo_id, material_id: Number(r.material_id), qty_per_unit: String(r.qty_per_unit) }));
      t.work_order_recipes = [...t.work_order_recipes, ...recipe];
      t.work_orders = t.work_orders.map((w) => (same(w.wo_id, woId) ? { ...w, status: WO_STATUS.DIPROSES, started_at: at, recipe_snapshot_at: at, updated_at: at } : w));
    } else {
      t.work_orders = t.work_orders.map((w) => (same(w.wo_id, woId) ? { ...w, status: WO_STATUS.DIBATALKAN, cancelled_at: at, updated_at: at } : w));
    }
    return { data: workOrderView(t, woId), tables: changed(t) };
  });
}

/** Isian awal hanya-baca (K10): AD-07 hari ini & AD-05 tanggal itu, plus WO aktif tanggal itu */
export function getPlanSource(date) {
  const todayKey = getMockTodayKey();
  const window = getRequirementWindow(todayKey);
  const key = typeof date === 'string' && date ? date : todayKey;
  if (!isValidDateKey(key) || key < window.from || key > window.to) throw createApiError('Tanggal produksi harus hari ini s.d. 29 hari ke depan (WIB).', 400);
  const board = key === todayKey ? buildDailyStockBoard() : null;
  const calendar = buildProductionCalendar(null, key);
  const t = workTables();
  return {
    date: key,
    today_key: todayKey,
    ready_plan: (board?.rows ?? []).filter((r) => r.qty_planned > 0).map((r) => ({ product_id: String(r.product_id), name: r.name, qty_planned: r.qty_planned })),
    calendar: calendar.selected.groups.map((g) => ({
      product_id: String(g.product_id), name: g.name, availability_type: g.availability_type, design_label: g.design_label ?? null, quantity: g.quantity,
    })),
    active_work_orders: t.work_orders.filter((w) => w.production_date === key && [WO_STATUS.DRAFT, WO_STATUS.DIPROSES].includes(w.status))
      .sort((a, b) => a.wo_id - b.wo_id).map((w) => ({
        wo_id: String(w.wo_id), wo_number: w.wo_number, product_id: String(w.product_id),
        product_name: t.products.find((p) => same(p.product_id, w.product_id))?.name ?? '', qty_planned: w.qty_planned, status: w.status,
      })),
  };
}
