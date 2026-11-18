// services/reportService.js
// Step 5.8 · FR-33 · UC-27 · UC-28 · AD-08 — laporan penjualan & ekspor (Owner, SPEC §2)
// Ekspor dibuat di peramban dari data laporan yang sama (utils/reportExport.js), jadi isi file = isi layar.

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { buildReportForFilter } from './mock/reportViews';
import { buildOperationsReportForFilter } from './mock/operationsReport';
import { ROLES } from '../constants/roles';

/**
 * @param {{period, from?, to?}} filter — periode (constants/report.js); from/to untuk rentang khusus
 * @returns {Promise<{todayKey, period, from, to, kpi, daily, bestSellers, paymentMethods, transactions}>}
 */
export function getSalesReport(filter) {
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  return apiClient(`/admin/reports/sales?${query}`, {
    mockHandler: () => {
      requireMockRole(ROLES.OWNER);
      return buildReportForFilter(filter);
    },
  });
}

/**
 * CR-04c · FR-47 · AD-08 tab Operasional (Owner, K18) — periode sama dengan laporan penjualan (K16). Hanya membaca.
 * @param {{period, from?, to?}} filter
 * @returns {Promise<{todayKey, store_name, period, from, to, purchases, movements, usage, production, plan_vs_output, revenue, analysis}>}
 */
export function getOperationsReport(filter) {
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  return apiClient(`/admin/reports/operations?${query}`, { mockHandler: () => buildOperationsReportForFilter(filter) });
}
