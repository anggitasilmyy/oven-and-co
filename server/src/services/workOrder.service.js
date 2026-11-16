// services/workOrder.service.js
// CR-04b · FR-45 · UC-36 · BR-25, BR-27, BR-31, BR-34 · K10, K14 · AD-13 — buat WO (Draft, nomor WO-YYMMDD-NNN), ubah WO
// Draft, transisi {from, to}: mulai (Draft → Diproses; salin product_materials ke work_order_recipes & isi
// recipe_snapshot_at — juga bila resep kosong, AC-45.3) dan batal (Draft/Diproses → Dibatalkan; pengeluaran tetap, BR-28).
// WO dibuat manual (K10): tidak menyimpan tautan ke pesanan dan tidak menulis daily_stocks/orders/products (BR-29).
// Urutan kunci (Draft 0.8.3 §10.1): users S → operation_requests → store_settings X (hanya buat: penomoran) →
// work_orders FOR UPDATE. Tidak ada SELECT biasa sebelum kunci di dalam transaksi.

const { AUDIT_ACTION, AUDIT_ENTITY, WO_STATUS } = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const { validateWorkOrder, workOrderTransitionError, nextWorkOrderNumber } = require('./workOrderRules.service');
const { loadWorkOrder, WO_NOT_FOUND } = require('./workOrderView.service');
const { toWorkOrderView } = require('./workOrderViewRules.service');

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode, ...(fieldErrors ? { fieldErrors } : {}) });
}

/** Kunci baris WO (FOR UPDATE) → {wo_id, product_id, status}; 404 bila tidak ada */
async function lockWorkOrder(tx, woId) {
  const [wo] = await tx.$queryRaw`SELECT wo_id, product_id, status FROM work_orders WHERE wo_id = ${BigInt(woId)} FOR UPDATE`;
  if (!wo) throw httpError(404, WO_NOT_FOUND);
  return wo;
}

/** Produk untuk validasi (dibaca setelah kunci pertama transaksi) → Map(product_id → {is_active}) */
async function productsFor(tx, productId) {
  const id = /^[1-9]\d{0,18}$/.test(String(productId ?? '').trim()) ? BigInt(String(productId).trim()) : null;
  if (id === null) return new Map();
  const rows = await tx.$queryRaw`SELECT product_id, is_active FROM products WHERE product_id = ${id}`;
  return new Map(rows.map((p) => [String(p.product_id), { is_active: Boolean(Number(p.is_active)) }]));
}

async function validWorkOrder(tx, input, now) {
  const { errors, value } = validateWorkOrder(input, { products: await productsFor(tx, input.product_id), todayKey: getJakartaDateKey(now) });
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);
  return value;
}

const woPayload = (input) => ({
  product_id: input.product_id ?? null, production_date: input.production_date ?? null, qty_planned: input.qty_planned ?? null, note: input.note ?? null,
});
const viewOf = async (tx, woId) => toWorkOrderView(await loadWorkOrder(tx, woId));

/** POST /api/admin/work-orders { product_id, production_date, qty_planned, note? } (request_id wajib) → 201 WO Draft */
async function createWorkOrder(actorId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'create_work_order', targetType: null, targetId: null, payload: woPayload(input), successStatus: 201,
  }, async (tx) => {
    await lockAdminMasterData(tx); // menyerialkan penomoran WO-YYMMDD-NNN (pola nomor PO)
    const value = await validWorkOrder(tx, input, now);
    const dateKey = getJakartaDateKey(now);
    const prefix = `WO-${dateKey.slice(2, 4)}${dateKey.slice(5, 7)}${dateKey.slice(8, 10)}-`;
    const existing = await tx.workOrder.findMany({ where: { woNumber: { startsWith: prefix } }, select: { woNumber: true } });
    const wo = await tx.workOrder.create({
      data: {
        woNumber: nextWorkOrderNumber(existing.map((w) => w.woNumber), dateKey), productId: BigInt(value.product_id),
        productionDate: dateKeyToDbDate(value.production_date), qtyPlanned: value.qty_planned, note: value.note,
        createdBy: BigInt(actorId), createdRequestId: requestId,
      },
      select: { woId: true },
    });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.CREATE_WORK_ORDER, entity: AUDIT_ENTITY.WORK_ORDERS, entityId: wo.woId, now });
    return viewOf(tx, wo.woId);
  });
}

/** PUT /api/admin/work-orders/:id (hanya Draft; request_id opsional) — produk, tanggal, rencana, catatan */
async function updateWorkOrder(actorId, woId, input, { requestId, now = new Date() } = {}) {
  return runOperation({
    actorId, requestId, operation: 'update_work_order', targetType: 'work_order', targetId: String(woId), payload: woPayload(input), successStatus: 200,
  }, async (tx) => {
    const wo = await lockWorkOrder(tx, woId);
    if (wo.status !== WO_STATUS.DRAFT) throw httpError(409, 'WO hanya dapat diubah saat berstatus Draft.');
    const value = await validWorkOrder(tx, input, now);
    await tx.workOrder.update({
      where: { woId: BigInt(woId) },
      data: { productId: BigInt(value.product_id), productionDate: dateKeyToDbDate(value.production_date), qtyPlanned: value.qty_planned, note: value.note },
    });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.UPDATE_WORK_ORDER, entity: AUDIT_ENTITY.WORK_ORDERS, entityId: woId, now });
    return viewOf(tx, woId);
  });
}

/**
 * PATCH /api/admin/work-orders/:id/status { from, to } (request_id wajib). Mulai: snapshot resep produk saat ini
 * (dibaca konsisten setelah WO dikunci; perubahan resep kemudian tidak mengubah standar, AC-45.3). Batal: tanpa dokumen hasil.
 */
async function transitionWorkOrder(actorId, woId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'transition_work_order', targetType: 'work_order', targetId: String(woId),
    payload: { from: input.from, to: input.to }, successStatus: 200,
  }, async (tx) => {
    const wo = await lockWorkOrder(tx, woId);
    const conflict = workOrderTransitionError(wo.status, input.from, input.to);
    if (conflict) throw httpError(conflict.status, conflict.message);
    if (input.to === WO_STATUS.DIPROSES) {
      const recipe = await tx.productMaterial.findMany({ where: { productId: wo.product_id }, orderBy: { materialId: 'asc' } });
      if (recipe.length) {
        await tx.workOrderRecipe.createMany({ data: recipe.map((r) => ({ woId: BigInt(woId), materialId: r.materialId, qtyPerUnit: r.qtyPerUnit })) });
      }
      await tx.workOrder.update({ where: { woId: BigInt(woId) }, data: { status: WO_STATUS.DIPROSES, startedAt: now, recipeSnapshotAt: now } });
      await recordAudit(tx, { actorId, action: AUDIT_ACTION.START_WORK_ORDER, entity: AUDIT_ENTITY.WORK_ORDERS, entityId: woId, now });
    } else {
      await tx.workOrder.update({ where: { woId: BigInt(woId) }, data: { status: WO_STATUS.DIBATALKAN, cancelledAt: now } });
      await recordAudit(tx, { actorId, action: AUDIT_ACTION.CANCEL_WORK_ORDER, entity: AUDIT_ENTITY.WORK_ORDERS, entityId: woId, now });
    }
    return viewOf(tx, woId);
  });
}

module.exports = { lockWorkOrder, createWorkOrder, updateWorkOrder, transitionWorkOrder };
