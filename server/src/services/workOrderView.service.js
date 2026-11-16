// services/workOrderView.service.js
// CR-04b · FR-45, FR-46 · K10 · AC-45.1 · AD-13 — data Work Order (Staf & Owner): detail (snapshot resep, dokumen
// pengeluaran & hasil dengan status berlaku, standar/aktual/selisih lewat aturan murni workOrderViewRules), daftar ringkas,
// dan isian awal perencanaan (plan-source) yang HANYA MEMBACA AD-07 (rencana ready hari ini) & AD-05 (kalender produksi)
// lewat service yang sudah ada — tanpa tautan ke pesanan dan tanpa menulis apa pun (K10, AC-45.1).
// DECIMAL dibaca sebagai teks (CAST AS CHAR). `client` = PrismaClient atau transaksi.

const prisma = require('../lib/prisma');
const { WO_STATUS } = require('../utils/businessConstants');
const { getJakartaDateKey, isValidDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { getRequirementWindow } = require('./materialRequirementRules.service');
const { getProductionCalendar } = require('./productionCalendar.service');
const { getDailyStockBoard } = require('./adminDailyStock.service');
const { toWorkOrderView, toWorkOrderListRow } = require('./workOrderViewRules.service');

const WO_NOT_FOUND = 'Work order tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

/** WO + snapshot resep + dokumen pengeluaran (baris) + dokumen hasil + nama/satuan bahan; null bila tidak ada */
async function loadWorkOrder(client, woId) {
  const id = BigInt(woId);
  const [wo] = await client.$queryRaw`SELECT w.wo_id, w.wo_number, w.product_id, p.name AS product_name, w.production_date,
    w.qty_planned, w.status, w.note, w.recipe_snapshot_at, w.started_at, w.completed_at, w.cancelled_at, w.created_at
    FROM work_orders w JOIN products p ON p.product_id = w.product_id WHERE w.wo_id = ${id}`;
  if (!wo) return null;
  const recipe = await client.$queryRaw`SELECT material_id, CAST(qty_per_unit AS CHAR) AS qty_per_unit FROM work_order_recipes
    WHERE wo_id = ${id} ORDER BY material_id`;
  const issues = await client.$queryRaw`SELECT d.issue_id, d.kind, d.reverses_id, d.replaces_id, d.reason, d.created_at,
    (SELECT COUNT(*) FROM material_issues x WHERE x.reverses_id = d.issue_id) AS reversed_count,
    (SELECT COUNT(*) FROM material_issues x WHERE x.replaces_id = d.issue_id) AS replaced_count
    FROM material_issues d WHERE d.wo_id = ${id} ORDER BY d.issue_id`;
  const lines = await client.$queryRaw`SELECT l.issue_id, l.material_id, CAST(l.qty AS CHAR) AS qty FROM material_issue_lines l
    JOIN material_issues d ON d.issue_id = l.issue_id WHERE d.wo_id = ${id} ORDER BY l.material_id`;
  const outputs = await client.$queryRaw`SELECT o.output_id, o.kind, o.qty_output, o.reverses_id, o.replaces_id, o.reason, o.recorded_at,
    (SELECT COUNT(*) FROM production_outputs x WHERE x.reverses_id = o.output_id) AS reversed_count,
    (SELECT COUNT(*) FROM production_outputs x WHERE x.replaces_id = o.output_id) AS replaced_count
    FROM production_outputs o WHERE o.wo_id = ${id} ORDER BY o.output_id`;
  const ids = [...new Set([...recipe.map((r) => String(r.material_id)), ...lines.map((l) => String(l.material_id))])];
  const names = ids.length
    ? await client.$queryRawUnsafe(`SELECT material_id, name, unit FROM raw_materials WHERE material_id IN (${ids.map(() => '?').join(', ')})`, ...ids.map(BigInt))
    : [];
  return {
    wo,
    recipe,
    issues: issues.map((d) => ({ ...d, lines: lines.filter((l) => String(l.issue_id) === String(d.issue_id)) })),
    outputs,
    materials: new Map(names.map((m) => [String(m.material_id), { name: m.name, unit: m.unit }])),
  };
}

/** GET /api/admin/work-orders/:id */
async function getWorkOrder(woId, client = prisma) {
  const data = await loadWorkOrder(client, woId);
  if (!data) throw httpError(404, WO_NOT_FOUND);
  return toWorkOrderView(data);
}

/** GET /api/admin/work-orders → daftar ringkas (terbaru dulu) dengan hasil bersih */
async function listWorkOrders() {
  const rows = await prisma.$queryRaw`SELECT w.wo_id, w.wo_number, w.product_id, p.name AS product_name, w.production_date,
    w.qty_planned, w.status, w.created_at FROM work_orders w JOIN products p ON p.product_id = w.product_id ORDER BY w.wo_id DESC`;
  const outputs = await prisma.$queryRaw`SELECT wo_id, kind, qty_output FROM production_outputs`;
  return rows.map((w) => toWorkOrderListRow(w, outputs.filter((o) => String(o.wo_id) === String(w.wo_id))));
}

/**
 * GET /api/admin/work-orders/plan-source?date=YYYY-MM-DD (K10, hanya baca): rencana ready AD-07 (hanya bila tanggal = hari
 * ini WIB) & daftar produksi AD-05 tanggal itu — angka apa adanya dari service AD-07/AD-05 — serta WO aktif (Draft/Diproses)
 * tanggal itu agar WO ganda terlihat. Tanggal di luar T … T+29 → 400.
 */
async function getPlanSource(date, now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  const window = getRequirementWindow(todayKey);
  const key = typeof date === 'string' && date ? date : todayKey;
  if (!isValidDateKey(key) || key < window.from || key > window.to) throw httpError(400, 'Tanggal produksi harus hari ini s.d. 29 hari ke depan (WIB).');
  const board = key === todayKey ? await getDailyStockBoard(now) : null;
  const calendar = await getProductionCalendar({ date: key }, now);
  const active = await prisma.$queryRaw`SELECT w.wo_id, w.wo_number, w.product_id, p.name AS product_name, w.qty_planned, w.status
    FROM work_orders w JOIN products p ON p.product_id = w.product_id
    WHERE w.production_date = ${dateKeyToDbDate(key)} AND w.status IN (${WO_STATUS.DRAFT}, ${WO_STATUS.DIPROSES}) ORDER BY w.wo_id`;
  return {
    date: key,
    today_key: todayKey,
    ready_plan: (board?.rows ?? []).filter((r) => r.qty_planned > 0).map((r) => ({ product_id: r.product_id, name: r.name, qty_planned: r.qty_planned })),
    calendar: calendar.selected.groups.map((g) => ({
      product_id: g.product_id, name: g.name, availability_type: g.availability_type, design_label: g.design_label, quantity: g.quantity,
    })),
    active_work_orders: active.map((w) => ({
      wo_id: String(w.wo_id), wo_number: w.wo_number, product_id: String(w.product_id), product_name: w.product_name,
      qty_planned: Number(w.qty_planned), status: w.status,
    })),
  };
}

module.exports = { WO_NOT_FOUND, loadWorkOrder, getWorkOrder, listWorkOrders, getPlanSource };
