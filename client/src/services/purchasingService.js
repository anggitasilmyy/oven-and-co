// services/purchasingService.js
// CR-04a CP6 · FR-41 – FR-43 · UC-33 – UC-35 · AD-12 Pembelian (Staf & Owner) — supplier, purchase order, penerimaan.
// Mode API memanggil endpoint CP5; mode mock memakai services/mock/{supplier,purchaseOrder,goodsReceipt}Admin.js dengan
// aturan murni yang sama. Setiap aksi tulis menerima `requestId` (UUID v4, dibuat sekali per percobaan simpan oleh
// hooks/useRequestId) — kirim ulang dengan request_id sama tidak membuat dokumen ganda (BR-31).

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { ROLES } from '../constants/roles';
import * as suppliers from './mock/supplierAdmin';
import * as orders from './mock/purchaseOrderAdmin';
import * as receipts from './mock/goodsReceiptAdmin';

const actor = () => requireMockRole(ROLES.STAF, ROLES.OWNER);
const withId = (body, requestId) => (requestId ? { ...body, request_id: requestId } : body);

export const getSuppliers = () => apiClient('/admin/suppliers', { mockHandler: () => { actor(); return suppliers.listSuppliers(); } });

export function saveSupplier(supplierId, input, requestId) {
  const create = supplierId == null;
  return apiClient(create ? '/admin/suppliers' : `/admin/suppliers/${supplierId}`, {
    method: create ? 'POST' : 'PUT',
    body: withId(input, requestId),
    mockHandler: () => (create ? suppliers.createSupplier(actor(), input, { requestId }) : suppliers.updateSupplier(actor(), supplierId, input, { requestId })),
  });
}

export function setSupplierActive(supplierId, isActive, requestId) {
  return apiClient(`/admin/suppliers/${supplierId}/active`, {
    method: 'PATCH', body: withId({ is_active: isActive }, requestId),
    mockHandler: () => suppliers.setSupplierActive(actor(), supplierId, isActive, { requestId }),
  });
}

export const getPurchaseOrders = () => apiClient('/admin/purchase-orders', { mockHandler: () => { actor(); return orders.listPurchaseOrders(); } });

export const getPurchaseOrder = (poId) => apiClient(`/admin/purchase-orders/${poId}`, { mockHandler: () => { actor(); return orders.getPurchaseOrder(poId); } });

export function savePurchaseOrder(poId, input, requestId) {
  const create = poId == null;
  return apiClient(create ? '/admin/purchase-orders' : `/admin/purchase-orders/${poId}`, {
    method: create ? 'POST' : 'PUT', body: withId(input, requestId),
    mockHandler: () => (create ? orders.createPurchaseOrder(actor(), input, { requestId }) : orders.updatePurchaseOrder(actor(), poId, input, { requestId })),
  });
}

/** {from, to, cancel_reason?} — pesan (Draft → Dipesan) atau batal */
export function changePurchaseOrderStatus(poId, input, requestId) {
  return apiClient(`/admin/purchase-orders/${poId}/status`, {
    method: 'PATCH', body: withId(input, requestId),
    mockHandler: () => orders.transitionPurchaseOrder(actor(), poId, input, { requestId }),
  });
}

/** {lines[{po_item_id, qty}], note?} */
export function receivePurchaseOrder(poId, input, requestId) {
  return apiClient(`/admin/purchase-orders/${poId}/receipts`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => receipts.receivePurchaseOrder(actor(), poId, input, { requestId }),
  });
}

/** Pembalik {reason} atau koreksi {lines, reason, note?} dokumen penerimaan */
export function reverseOrCorrectReceipt(receiptId, input, requestId, { correct }) {
  return apiClient(`/admin/goods-receipts/${receiptId}/${correct ? 'correct' : 'reverse'}`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => receipts.reverseOrCorrectReceipt(actor(), receiptId, input, { requestId, correct }),
  });
}
