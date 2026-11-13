// services/purchasingService.js
// CR-04a CP6 · FR-41 – FR-43 · UC-33 – UC-35 · AD-12 Pembelian (Staf & Owner) — supplier, purchase order, penerimaan.
// Mode API memanggil endpoint CP5; mode mock memakai services/mock/{supplier,purchaseOrder,goodsReceipt}Admin.js dengan
// aturan murni yang sama. Setiap aksi tulis menerima `requestId` (UUID v4, dibuat sekali per percobaan simpan oleh
// hooks/useRequestId) — kirim ulang dengan request_id sama tidak membuat dokumen ganda (BR-31).
// CP7: mode mock melewati urutan rute API yang sama (mock/requestBody.mockRoute: request_id → auth → ID → body).

import { apiClient } from './apiClient';
import * as R from './mock/requestBody';
import * as suppliers from './mock/supplierAdmin';
import * as orders from './mock/purchaseOrderAdmin';
import * as receipts from './mock/goodsReceiptAdmin';

const SUPPLIER_ID = 'ID supplier tidak valid.';
const PO_ID = 'ID purchase order tidak valid.';
const RECEIPT_ID = 'ID penerimaan tidak valid.';
const withId = (body, requestId) => (requestId ? { ...body, request_id: requestId } : body);

export const getSuppliers = () => apiClient('/admin/suppliers', { mockHandler: () => R.mockRoute({ operation: null }, () => suppliers.listSuppliers()) });

export function saveSupplier(supplierId, input, requestId) {
  const create = supplierId == null;
  return apiClient(create ? '/admin/suppliers' : `/admin/suppliers/${supplierId}`, {
    method: create ? 'POST' : 'PUT',
    body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: create ? 'create_supplier' : 'update_supplier', requestId, ids: create ? [] : [[supplierId, SUPPLIER_ID]], body: input, validate: R.validateSupplierBody,
    }, (actor, body) => (create ? suppliers.createSupplier(actor, body, { requestId }) : suppliers.updateSupplier(actor, supplierId, body, { requestId }))),
  });
}

export function setSupplierActive(supplierId, isActive, requestId) {
  return apiClient(`/admin/suppliers/${supplierId}/active`, {
    method: 'PATCH', body: withId({ is_active: isActive }, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'set_supplier_active', requestId, ids: [[supplierId, SUPPLIER_ID]], body: { is_active: isActive }, validate: R.validateSupplierActiveBody,
    }, (actor, active) => suppliers.setSupplierActive(actor, supplierId, active, { requestId })),
  });
}

export const getPurchaseOrders = () => apiClient('/admin/purchase-orders', { mockHandler: () => R.mockRoute({ operation: null }, () => orders.listPurchaseOrders()) });

export const getPurchaseOrder = (poId) => apiClient(`/admin/purchase-orders/${poId}`, { mockHandler: () => R.mockRoute({ operation: null, ids: [[poId, PO_ID]] }, () => orders.getPurchaseOrder(poId)) });

export function savePurchaseOrder(poId, input, requestId) {
  const create = poId == null;
  return apiClient(create ? '/admin/purchase-orders' : `/admin/purchase-orders/${poId}`, {
    method: create ? 'POST' : 'PUT', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: create ? 'create_purchase_order' : 'update_purchase_order', requestId, ids: create ? [] : [[poId, PO_ID]], body: input, validate: R.validatePurchaseOrderBody,
    }, (actor, body) => (create ? orders.createPurchaseOrder(actor, body, { requestId }) : orders.updatePurchaseOrder(actor, poId, body, { requestId }))),
  });
}

/** {from, to, cancel_reason?} — pesan (Draft → Dipesan) atau batal */
export function changePurchaseOrderStatus(poId, input, requestId) {
  return apiClient(`/admin/purchase-orders/${poId}/status`, {
    method: 'PATCH', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'transition_purchase_order', requestId, ids: [[poId, PO_ID]], body: input, validate: R.validateTransitionBody,
    }, (actor, body) => orders.transitionPurchaseOrder(actor, poId, body, { requestId })),
  });
}

/** {lines[{po_item_id, qty}], note?} */
export function receivePurchaseOrder(poId, input, requestId) {
  return apiClient(`/admin/purchase-orders/${poId}/receipts`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'receive_purchase_order', requestId, ids: [[poId, PO_ID]], body: input, validate: R.validateReceiptBody,
    }, (actor, body) => receipts.receivePurchaseOrder(actor, poId, body, { requestId })),
  });
}

/** Pembalik {reason} atau koreksi {lines, reason, note?} dokumen penerimaan */
export function reverseOrCorrectReceipt(receiptId, input, requestId, { correct }) {
  return apiClient(`/admin/goods-receipts/${receiptId}/${correct ? 'correct' : 'reverse'}`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: correct ? 'correct_goods_receipt' : 'reverse_goods_receipt', requestId, ids: [[receiptId, RECEIPT_ID]], body: input,
      validate: correct ? R.validateReceiptCorrectBody : R.validateReceiptReverseBody,
    }, (actor, body) => receipts.reverseOrCorrectReceipt(actor, receiptId, body, { requestId, correct })),
  });
}
