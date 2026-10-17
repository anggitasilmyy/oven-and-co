// services/reportService.js
// Step 5.8 · FR-33 · UC-27 · UC-28 · AD-08 — laporan penjualan & ekspor (Owner, SPEC §2)
// Ekspor dibuat di peramban dari data laporan yang sama (utils/reportExport.js), jadi isi file = isi layar.

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { buildReportForFilter } from './mock/reportViews';
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
