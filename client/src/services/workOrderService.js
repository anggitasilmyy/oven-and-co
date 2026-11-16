// services/workOrderService.js
// CR-04b · FR-45, FR-46 · UC-36, UC-37 · AD-13 Produksi (Staf & Owner, K09) — Work Order, pengeluaran bahan, hasil
// produksi, isian awal perencanaan (hanya baca AD-07/AD-05). Mode API memanggil endpoint CR-04b; mode mock melewati urutan
// rute API yang sama (mock/requestBody.mockRoute: request_id → auth → ID → body) lalu services/mock/{workOrder,
// materialIssue,productionOutput}Admin.js dengan aturan murni yang sama. Setiap aksi tulis menerima `requestId` (UUID v4,
// dibuat sekali per percobaan simpan) — kirim ulang dengan request_id sama tidak membuat dokumen ganda (BR-31).

import { apiClient } from './apiClient';
import * as R from './mock/requestBody';
import * as orders from './mock/workOrderAdmin';
import * as issues from './mock/materialIssueAdmin';
import * as outputs from './mock/productionOutputAdmin';

const WO_ID = 'ID work order tidak valid.';
const ISSUE_ID = 'ID pengeluaran tidak valid.';
const OUTPUT_ID = 'ID hasil produksi tidak valid.';
const withId = (body, requestId) => (requestId ? { ...body, request_id: requestId } : body);

export const getWorkOrders = () => apiClient('/admin/work-orders', { mockHandler: () => R.mockRoute({ operation: null }, () => orders.listWorkOrders()) });

export const getWorkOrder = (woId) => apiClient(`/admin/work-orders/${woId}`, {
  mockHandler: () => R.mockRoute({ operation: null, ids: [[woId, WO_ID]] }, () => orders.getWorkOrder(woId)),
});

/** Isian awal hanya-baca (K10): rencana ready AD-07 (hari ini), kalender AD-05, WO aktif tanggal itu */
export const getPlanSource = (date = '') => apiClient(`/admin/work-orders/plan-source${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
  mockHandler: () => R.mockRoute({ operation: null }, () => orders.getPlanSource(date)),
});

/** Buat (woId kosong) atau ubah WO Draft: { product_id, production_date, qty_planned, note? } */
export function saveWorkOrder(woId, input, requestId) {
  const create = woId == null;
  return apiClient(create ? '/admin/work-orders' : `/admin/work-orders/${woId}`, {
    method: create ? 'POST' : 'PUT', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: create ? 'create_work_order' : 'update_work_order', requestId, ids: create ? [] : [[woId, WO_ID]], body: input, validate: R.validateWorkOrderBody,
    }, (actor, body) => (create ? orders.createWorkOrder(actor, body, { requestId }) : orders.updateWorkOrder(actor, woId, body, { requestId }))),
  });
}

/** {from, to} — mulai (Draft → Diproses, snapshot resep) atau batal */
export function changeWorkOrderStatus(woId, input, requestId) {
  return apiClient(`/admin/work-orders/${woId}/status`, {
    method: 'PATCH', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'transition_work_order', requestId, ids: [[woId, WO_ID]], body: input, validate: R.validateWorkOrderTransitionBody,
    }, (actor, body) => orders.transitionWorkOrder(actor, woId, body, { requestId })),
  });
}

/** Pengeluaran bahan {lines[{material_id, qty}]} */
export function issueMaterials(woId, input, requestId) {
  return apiClient(`/admin/work-orders/${woId}/issues`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'issue_material', requestId, ids: [[woId, WO_ID]], body: input, validate: R.validateIssueBody,
    }, (actor, body) => issues.issueMaterials(actor, woId, body, { requestId })),
  });
}

/** Selesaikan WO {qty_output, lines?} — satu dokumen hasil; pengeluaran terakhir opsional */
export function completeWorkOrder(woId, input, requestId) {
  return apiClient(`/admin/work-orders/${woId}/complete`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: 'complete_work_order', requestId, ids: [[woId, WO_ID]], body: input, validate: R.validateCompleteBody,
    }, (actor, body) => outputs.completeWorkOrder(actor, woId, body, { requestId })),
  });
}

/** Pembalik {reason} atau koreksi {lines, reason} dokumen pengeluaran */
export function reverseOrCorrectIssue(issueId, input, requestId, { correct }) {
  return apiClient(`/admin/material-issues/${issueId}/${correct ? 'correct' : 'reverse'}`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: correct ? 'correct_material_issue' : 'reverse_material_issue', requestId, ids: [[issueId, ISSUE_ID]], body: input,
      validate: correct ? R.validateIssueCorrectBody : R.validateIssueReverseBody,
    }, (actor, body) => issues.reverseOrCorrectIssue(actor, issueId, body, { requestId, correct })),
  });
}

/** Pembalik {reason} atau koreksi {qty_output, reason} dokumen hasil produksi */
export function reverseOrCorrectOutput(outputId, input, requestId, { correct }) {
  return apiClient(`/admin/production-outputs/${outputId}/${correct ? 'correct' : 'reverse'}`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => R.mockRoute({
      operation: correct ? 'correct_production_output' : 'reverse_production_output', requestId, ids: [[outputId, OUTPUT_ID]], body: input,
      validate: correct ? R.validateOutputCorrectBody : R.validateOutputReverseBody,
    }, (actor, body) => outputs.reverseOrCorrectOutput(actor, outputId, body, { requestId, correct })),
  });
}
