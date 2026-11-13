// services/mock/purchaseOrderAdmin.js
// CR-04a CP6 · FR-42 · UC-34 · BR-18, BR-19, BR-21, BR-22, BR-31 · AD-12 tab Purchase Order — pengganti
// purchaseOrder.service server (CP5) di mode mock: buat PO Draft (nomor PO-YYMMDD-NNN, aturan sama), ubah hanya Draft,
// transisi {from, to} (pesan memeriksa ulang supplier aktif & daftar bahan; batal menyimpan qty_cancelled historis).

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { runMockOperation, nextId, nowIso, loadLedgerTables } from './ledgerMock';
import { purchaseOrderView, purchaseOrderList, loadPurchaseOrderRows } from './purchaseOrderData';
import {
  validatePurchaseOrderItems, purchaseOrderTransitionError, cancellationQuantities, reasonError, nextPurchaseOrderNumber,
} from '../../utils/rules/purchasing';
import { orderItems } from '../../utils/rules/purchasePayload';
import { PO_STATUS } from '../../constants/purchasing';
import { createApiError } from '../../utils/apiErrors';

const PO_NOT_FOUND = 'Purchase order tidak ditemukan.';
const SUPPLIER_NOT_FOUND = 'Supplier tidak ditemukan.';
const same = (a, b) => String(a) === String(b);
const noteOf = (note) => (typeof note === 'string' && note.trim() ? note.trim() : null);
const fieldError = (errors) => createApiError(Object.values(errors)[0], 400, undefined, { fieldErrors: errors });

function workTables() {
  const t = getTables('suppliers', 'supplier_materials', 'purchase_orders', 'purchase_order_items', 'goods_receipts', 'goods_receipt_lines', 'material_movements');
  return { ...t, raw_materials: loadLedgerTables().raw_materials };
}

function supplierOf(t, supplierId) {
  const s = t.suppliers.find((x) => same(x.supplier_id, supplierId));
  if (!s) throw fieldError({ supplier_id: SUPPLIER_NOT_FOUND });
  return { supplierActive: s.is_active, supplierMaterialIds: new Set(t.supplier_materials.filter((x) => same(x.supplier_id, supplierId)).map((x) => String(x.material_id))) };
}

function validItems(t, input) {
  const { errors, value } = validatePurchaseOrderItems(input.items, supplierOf(t, input.supplier_id));
  const note = reasonError(input.note, { required: false });
  if (note) errors.note = note;
  if (Object.keys(errors).length) throw fieldError(errors);
  return value;
}

const payload = (input) => ({ supplier_id: input.supplier_id == null ? null : String(input.supplier_id), note: input.note ?? null, items: orderItems(input.items) });
const itemRows = (t, poId, items) => items.map((i, k) => ({
  po_item_id: nextId(t.purchase_order_items, 'po_item_id') + k, po_id: poId, material_id: Number(i.material_id), qty_ordered: i.qty_ordered,
  unit_price: i.unit_price, qty_cancelled: '0.00',
}));

export const listPurchaseOrders = () => purchaseOrderList(workTables());

export function getPurchaseOrder(poId) {
  const t = workTables();
  if (!t.purchase_orders.some((p) => same(p.po_id, poId))) throw createApiError(PO_NOT_FOUND, 404);
  return purchaseOrderView(t, poId);
}

export function createPurchaseOrder(actor, input, { requestId }) {
  return runMockOperation({ requestId, actorId: actor.user_id, operation: 'create_purchase_order', payload: payload(input), successStatus: 201 }, () => {
    const t = workTables();
    const items = validItems(t, input);
    const poId = nextId(t.purchase_orders, 'po_id');
    const po = {
      po_id: poId, po_number: nextPurchaseOrderNumber(t.purchase_orders.map((p) => p.po_number), getMockTodayKey()), supplier_id: Number(input.supplier_id),
      status: PO_STATUS.DRAFT, note: noteOf(input.note), ordered_at: null, cancelled_at: null, cancel_reason: null, created_by: actor.user_id,
      created_request_id: requestId, created_at: nowIso(), updated_at: nowIso(),
    };
    const next = { purchase_orders: [...t.purchase_orders, po], purchase_order_items: [...t.purchase_order_items, ...itemRows(t, poId, items)] };
    return { data: purchaseOrderView({ ...t, ...next }, poId), tables: next };
  });
}

function draftOf(t, poId) {
  const po = t.purchase_orders.find((p) => same(p.po_id, poId));
  if (!po) throw createApiError(PO_NOT_FOUND, 404);
  return po;
}

export function updatePurchaseOrder(actor, poId, input, { requestId } = {}) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'update_purchase_order', targetType: 'purchase_order', targetId: String(poId), payload: payload(input), successStatus: 200,
  }, () => {
    const t = workTables();
    const supplier = supplierOf(t, input.supplier_id); // urutan server: supplier dikunci sebelum PO
    const po = draftOf(t, poId);
    if (po.status !== PO_STATUS.DRAFT) throw createApiError('PO hanya dapat diubah saat berstatus Draft.', 409);
    const { errors, value } = validatePurchaseOrderItems(input.items, supplier);
    const note = reasonError(input.note, { required: false });
    if (note) errors.note = note;
    if (Object.keys(errors).length) throw fieldError(errors);
    const kept = t.purchase_order_items.filter((i) => !same(i.po_id, poId));
    const next = {
      purchase_orders: t.purchase_orders.map((p) => (same(p.po_id, poId) ? { ...p, supplier_id: Number(input.supplier_id), note: noteOf(input.note), updated_at: nowIso() } : p)),
      purchase_order_items: [...kept, ...itemRows({ purchase_order_items: t.purchase_order_items }, po.po_id, value)],
    };
    return { data: purchaseOrderView({ ...t, ...next }, poId), tables: next };
  });
}

export function transitionPurchaseOrder(actor, poId, input, { requestId }) {
  return runMockOperation({
    requestId, actorId: actor.user_id, operation: 'transition_purchase_order', targetType: 'purchase_order', targetId: String(poId),
    payload: { from: input.from, to: input.to, cancel_reason: input.cancel_reason ?? null }, successStatus: 200,
  }, () => {
    const t = workTables();
    const po = draftOf(t, poId);
    const conflict = purchaseOrderTransitionError(po.status, input.from, input.to);
    if (conflict) throw createApiError(conflict.message, conflict.status);
    const rows = loadPurchaseOrderRows(t, poId);
    let next;
    if (input.to === PO_STATUS.DIPESAN) {
      const { errors } = validatePurchaseOrderItems(rows.items, supplierOf(t, po.supplier_id));
      if (Object.keys(errors).length) throw createApiError(`PO tidak dapat dipesan: ${Object.values(errors)[0]}`, 409);
      next = { purchase_orders: t.purchase_orders.map((p) => (same(p.po_id, poId) ? { ...p, status: PO_STATUS.DIPESAN, ordered_at: nowIso(), updated_at: nowIso() } : p)) };
    } else {
      const cancelled = new Map(cancellationQuantities(rows.items).map((i) => [i.po_item_id, i.qty_cancelled]));
      next = {
        purchase_order_items: t.purchase_order_items.map((i) => (cancelled.has(String(i.po_item_id)) ? { ...i, qty_cancelled: cancelled.get(String(i.po_item_id)) } : i)),
        purchase_orders: t.purchase_orders.map((p) => (same(p.po_id, poId)
          ? { ...p, status: PO_STATUS.DIBATALKAN, cancelled_at: nowIso(), cancel_reason: noteOf(input.cancel_reason), updated_at: nowIso() } : p)),
      };
    }
    return { data: purchaseOrderView({ ...t, ...next }, poId), tables: next };
  });
}
