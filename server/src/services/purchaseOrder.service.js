// services/purchaseOrder.service.js
// CR-04a CP5 · FR-42 · UC-34 · BR-18, BR-19, BR-21, BR-22, BR-31, BR-34 · K04 – K06 · AD-12 tab Purchase Order.
// Buat PO (Draft, nomor PO-YYMMDD-NNN), ubah PO Draft, transisi {from, to}: pesan (Draft → Dipesan) dan batal (Draft /
// Dipesan / Diterima Sebagian → Dibatalkan; qty_cancelled = dipesan − bersih diterima, historis; penerimaan tetap).
// Aturan murni CP3 (validatePurchaseOrderItems, purchaseOrderTransitionError, cancellationQuantities, reasonError).
// Urutan kunci (Draft 0.8.3 §10.1): users S → operation_requests → store_settings X (hanya buat: penomoran) →
// suppliers FOR SHARE → supplier_materials FOR SHARE → purchase_orders FOR UPDATE.
// Tidak ada SELECT biasa sebelum kunci di dalam transaksi (REPEATABLE READ membuat read view pada SELECT biasa pertama):
// supplier PO untuk transisi dibaca DI LUAR transaksi lalu dicocokkan ulang setelah PO dikunci.

const prisma = require('../lib/prisma');
const { AUDIT_ACTION, AUDIT_ENTITY, PO_STATUS } = require('../utils/businessConstants');
const { getJakartaDateKey } = require('../utils/jakartaDate');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');
const { recordAudit } = require('./auditLog.service');
const { runOperation } = require('./operationRequest.service');
const {
  validatePurchaseOrderItems, purchaseOrderTransitionError, cancellationQuantities, reasonError, nextPurchaseOrderNumber,
} = require('./purchasingRules.service');
const { loadPurchaseOrder, toPurchaseOrderView, PO_NOT_FOUND } = require('./purchaseOrderView.service');
const { orderItems } = require('./purchasePayload.service');

const SUPPLIER_NOT_FOUND = 'Supplier tidak ditemukan.';
const NOT_DRAFT = 'PO hanya dapat diubah saat berstatus Draft.';

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode, ...(fieldErrors ? { fieldErrors } : {}) });
}

/** Kunci supplier & daftar bahannya (FOR SHARE) → {supplierActive, supplierMaterialIds} */
async function lockSupplierForPo(tx, supplierId) {
  const [s] = await tx.$queryRaw`SELECT is_active FROM suppliers WHERE supplier_id = ${BigInt(supplierId)} FOR SHARE`;
  if (!s) throw httpError(400, SUPPLIER_NOT_FOUND, { supplier_id: SUPPLIER_NOT_FOUND });
  const rows = await tx.$queryRaw`SELECT material_id FROM supplier_materials WHERE supplier_id = ${BigInt(supplierId)} FOR SHARE`;
  return { supplierActive: Boolean(Number(s.is_active)), supplierMaterialIds: new Set(rows.map((r) => String(r.material_id))) };
}

function validItems(input, supplier) {
  const { errors, value } = validatePurchaseOrderItems(input.items, supplier);
  const note = reasonError(input.note, { required: false });
  if (note) errors.note = note;
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);
  return value;
}

async function lockPurchaseOrder(tx, poId) {
  const [po] = await tx.$queryRaw`SELECT po_id, supplier_id, status FROM purchase_orders WHERE po_id = ${BigInt(poId)} FOR UPDATE`;
  if (!po) throw httpError(404, PO_NOT_FOUND);
  return po;
}

const noteOf = (note) => (typeof note === 'string' && note.trim() ? note.trim() : null);
const poPayload = (input) => ({ supplier_id: input.supplier_id == null ? null : String(input.supplier_id), note: input.note ?? null, items: orderItems(input.items) });
const itemRows = (poId, items) => items.map((i) => ({ poId, materialId: BigInt(i.material_id), qtyOrdered: i.qty_ordered, unitPrice: i.unit_price }));
const viewOf = async (tx, poId) => toPurchaseOrderView(await loadPurchaseOrder(tx, poId));

/** POST /api/admin/purchase-orders { supplier_id, note?, items[] } (request_id wajib) → 201 PO Draft */
async function createPurchaseOrder(actorId, input, { requestId, now = new Date() }) {
  return runOperation({
    actorId, requestId, operation: 'create_purchase_order', targetType: null, targetId: null, payload: poPayload(input), successStatus: 201,
  }, async (tx) => {
    await lockAdminMasterData(tx); // menyerialkan penomoran PO-YYMMDD-NNN (pola nomor pesanan OVC)
    const items = validItems(input, await lockSupplierForPo(tx, input.supplier_id));
    const dateKey = getJakartaDateKey(now);
    const prefix = `PO-${dateKey.slice(2, 4)}${dateKey.slice(5, 7)}${dateKey.slice(8, 10)}-`;
    const existing = await tx.purchaseOrder.findMany({ where: { poNumber: { startsWith: prefix } }, select: { poNumber: true } });
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: nextPurchaseOrderNumber(existing.map((p) => p.poNumber), dateKey), supplierId: BigInt(input.supplier_id),
        note: noteOf(input.note), createdBy: BigInt(actorId), createdRequestId: requestId,
      },
      select: { poId: true },
    });
    await tx.purchaseOrderItem.createMany({ data: itemRows(po.poId, items) });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.CREATE_PURCHASE_ORDER, entity: AUDIT_ENTITY.PURCHASE_ORDERS, entityId: po.poId, now });
    return viewOf(tx, po.poId);
  });
}

/** PUT /api/admin/purchase-orders/:id (hanya Draft; request_id opsional) — supplier, catatan, item (pengganti penuh) */
async function updatePurchaseOrder(actorId, poId, input, { requestId, now = new Date() } = {}) {
  return runOperation({
    actorId, requestId, operation: 'update_purchase_order', targetType: 'purchase_order', targetId: String(poId), payload: poPayload(input), successStatus: 200,
  }, async (tx) => {
    const supplier = await lockSupplierForPo(tx, input.supplier_id);
    const po = await lockPurchaseOrder(tx, poId);
    if (po.status !== PO_STATUS.DRAFT) throw httpError(409, NOT_DRAFT);
    const items = validItems(input, supplier);
    await tx.purchaseOrderItem.deleteMany({ where: { poId: BigInt(poId) } });
    await tx.purchaseOrder.update({ where: { poId: BigInt(poId) }, data: { supplierId: BigInt(input.supplier_id), note: noteOf(input.note) } });
    await tx.purchaseOrderItem.createMany({ data: itemRows(BigInt(poId), items) });
    await recordAudit(tx, { actorId, action: AUDIT_ACTION.UPDATE_PURCHASE_ORDER, entity: AUDIT_ENTITY.PURCHASE_ORDERS, entityId: poId, now });
    return viewOf(tx, poId);
  });
}

/**
 * PATCH /api/admin/purchase-orders/:id/status { from, to, cancel_reason? } (request_id wajib).
 * Pesan: supplier masih aktif & semua item masih terdaftar (BR-18) → Dipesan, ordered_at. Batal: qty_cancelled per item.
 */
async function transitionPurchaseOrder(actorId, poId, input, { requestId, now = new Date() }) {
  const head = await prisma.purchaseOrder.findUnique({ where: { poId: BigInt(poId) }, select: { supplierId: true } });
  if (!head) throw httpError(404, PO_NOT_FOUND);
  return runOperation({
    actorId, requestId, operation: 'transition_purchase_order', targetType: 'purchase_order', targetId: String(poId),
    payload: { from: input.from, to: input.to, cancel_reason: input.cancel_reason ?? null }, successStatus: 200,
  }, async (tx) => {
    const supplier = input.to === PO_STATUS.DIPESAN ? await lockSupplierForPo(tx, head.supplierId) : null;
    const po = await lockPurchaseOrder(tx, poId);
    if (String(po.supplier_id) !== String(head.supplierId)) throw httpError(409, 'Data PO sudah berubah. Muat ulang data.');
    const conflict = purchaseOrderTransitionError(po.status, input.from, input.to);
    if (conflict) throw httpError(conflict.status, conflict.message);
    const data = await loadPurchaseOrder(tx, poId);
    if (input.to === PO_STATUS.DIPESAN) {
      const { errors } = validatePurchaseOrderItems(data.items, supplier);
      if (Object.keys(errors).length) throw httpError(409, `PO tidak dapat dipesan: ${Object.values(errors)[0]}`);
      await tx.purchaseOrder.update({ where: { poId: BigInt(poId) }, data: { status: PO_STATUS.DIPESAN, orderedAt: now } });
      await recordAudit(tx, { actorId, action: AUDIT_ACTION.ORDER_PURCHASE_ORDER, entity: AUDIT_ENTITY.PURCHASE_ORDERS, entityId: poId, now });
    } else {
      for (const item of cancellationQuantities(data.items)) {
        await tx.purchaseOrderItem.update({ where: { poItemId: BigInt(item.po_item_id) }, data: { qtyCancelled: item.qty_cancelled } });
      }
      await tx.purchaseOrder.update({
        where: { poId: BigInt(poId) }, data: { status: PO_STATUS.DIBATALKAN, cancelledAt: now, cancelReason: noteOf(input.cancel_reason) },
      });
      await recordAudit(tx, { actorId, action: AUDIT_ACTION.CANCEL_PURCHASE_ORDER, entity: AUDIT_ENTITY.PURCHASE_ORDERS, entityId: poId, now });
    }
    return viewOf(tx, poId);
  });
}

module.exports = { createPurchaseOrder, updatePurchaseOrder, transitionPurchaseOrder, lockPurchaseOrder };
