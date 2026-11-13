// services/stockService.js
// Step 5.7 · FR-32 · UC-24 · AD-07 — stok produk harian & bahan baku (Staf & Owner, SPEC §2)
// Stok tidak boleh negatif; bahan dengan stok ≤ minimum ditandai Menipis (juga tampil di Dashboard AD-02).
// CR-03 CP7 · FR-40 · UC-32: estimasi kebutuhan bahan (GET /api/admin/material-requirements, kontrak §B7.3).

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import {
  buildDailyStockBoard, saveDailyStockPlans, buildRawMaterialBoard, saveRawMaterial, recordMaterialStockIn,
} from './mock/stockAdmin';
import { buildMaterialRequirements } from './mock/materialRequirementAdmin';
import { countStock as mockCountStock, reverseOrCorrectStockIn, buildMaterialMovements } from './mock/stockDocumentAdmin';
import { ROLES } from '../constants/roles';

const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];
const asAdmin = (fn) => (...args) => {
  requireMockRole(...ADMIN_ROLES);
  return fn(...args);
};

/** @returns {Promise<{date, rows}>} stok produk ready hari ini */
export function getDailyStocks() {
  return apiClient('/admin/stocks/today', { mockHandler: asAdmin(buildDailyStockBoard) });
}

/**
 * Simpan rencana stok hari ini (qty_planned) — semua baris sah atau tidak ada yang disimpan.
 * @param {Array<{product_id, qty_planned}>} plans
 */
export function updateDailyStocks(plans) {
  return apiClient('/admin/stocks/today', {
    method: 'PUT',
    body: { plans },
    mockHandler: asAdmin(() => saveDailyStockPlans(plans)),
  });
}

/** @returns {Promise<{rows, summary}>} bahan baku + status Aman/Menipis/Habis */
export function getRawMaterials() {
  return apiClient('/admin/raw-materials', { mockHandler: asAdmin(buildRawMaterialBoard) });
}

const mockActor = () => requireMockRole(...ADMIN_ROLES);
const withId = (body, requestId) => (requestId ? { ...body, request_id: requestId } : body);

/**
 * Tambah (materialId kosong) atau ubah bahan baku. CR-04a: tambah → saldo awal; `requestId` opsional (BR-31).
 * Koreksi stok dari layar AD-07 memakai stock opname (countStock); form ubah tidak mengirim stok baru.
 */
export function saveMaterial(materialId, input, requestId) {
  return apiClient(materialId == null ? '/admin/raw-materials' : `/admin/raw-materials/${materialId}`, {
    method: materialId == null ? 'POST' : 'PUT',
    body: withId(input, requestId),
    mockHandler: () => saveRawMaterial(mockActor(), materialId, input, { requestId }),
  });
}

/** Catat Stok Masuk: tambah stok bahan sejumlah `qty` (dokumen stok_masuk + mutasi) */
export function recordStockIn(materialId, qty, requestId) {
  return apiClient(`/admin/raw-materials/${materialId}/stock-in`, {
    method: 'POST',
    body: withId({ qty }, requestId),
    mockHandler: () => recordMaterialStockIn(mockActor(), materialId, qty, { requestId }),
  });
}

/** CR-04a · FR-44 · BR-35: stock opname {counted_stock, expected_stock, reason?} — request_id wajib */
export function countStock(materialId, input, requestId) {
  return apiClient(`/admin/raw-materials/${materialId}/stock-counts`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => mockCountStock(mockActor(), materialId, input, { requestId }),
  });
}

/** CR-04a · BR-30: pembalik {reason} atau koreksi {qty, reason} dokumen stok masuk — request_id wajib */
export function reverseOrCorrectStockInDocument(adjustmentId, input, requestId, { correct }) {
  return apiClient(`/admin/stock-adjustments/${adjustmentId}/${correct ? 'correct' : 'reverse'}`, {
    method: 'POST', body: withId(input, requestId),
    mockHandler: () => reverseOrCorrectStockIn(mockActor(), adjustmentId, input, { requestId, correct }),
  });
}

/** CR-04a · FR-44: riwayat mutasi bahan → {material, movements[]} */
export function getMaterialMovements(materialId) {
  return apiClient(`/admin/raw-materials/${materialId}/movements`, { mockHandler: asAdmin(() => buildMaterialMovements(materialId)) });
}

/**
 * CR-03 CP7: estimasi kebutuhan bahan s.d. tanggal `date` (YYYY-MM-DD; kosong = hari ini WIB). Respons apa adanya dari
 * server/mock — tanpa perhitungan ulang di frontend.
 * @returns {Promise<{date, today_key, window, cumulative_range, includes_ready_plan, rows, summary, products_without_recipe}>}
 */
export function getMaterialRequirements(date = '') {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiClient(`/admin/material-requirements${query}`, { mockHandler: asAdmin(() => buildMaterialRequirements(date)) });
}
