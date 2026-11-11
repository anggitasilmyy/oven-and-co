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

/** Tambah (materialId kosong) atau ubah bahan baku */
export function saveMaterial(materialId, input) {
  return apiClient(materialId == null ? '/admin/raw-materials' : `/admin/raw-materials/${materialId}`, {
    method: materialId == null ? 'POST' : 'PUT',
    body: input,
    mockHandler: asAdmin(() => saveRawMaterial(materialId, input)),
  });
}

/** Catat Stok Masuk: tambah stok bahan sejumlah `qty` */
export function recordStockIn(materialId, qty) {
  return apiClient(`/admin/raw-materials/${materialId}/stock-in`, {
    method: 'POST',
    body: { qty },
    mockHandler: asAdmin(() => recordMaterialStockIn(materialId, qty)),
  });
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
