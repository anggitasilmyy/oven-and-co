// services/mock/reportViews.js
// Step 5.8 · FR-33 · UC-27 · AD-08 — laporan penjualan di mode mock (pengganti GET /api/admin/reports/sales, Step 6.4)

import { getTables } from './db';
import { getMockTodayKey } from './mockClock';
import { getMockUsers } from './users';
import { resolveReportRange, buildSalesReport } from '../../utils/businessRules';
import { REPORT_BEST_SELLER_LIMIT } from '../../constants/report';

const fail = (message) => { throw new Error(message); };

/**
 * @param {{period, from?, to?}} filter
 * @returns {{todayKey, store_name, period, from, to, kpi, daily, bestSellers, paymentMethods, transactions}}
 */
export function buildReportForFilter(filter = {}) {
  const todayKey = getMockTodayKey();
  const range = resolveReportRange(filter, todayKey);
  if (range.error) fail(range.error);
  const t = getTables('orders', 'order_items', 'payments', 'payment_methods', 'products', 'store_settings');
  const report = buildSalesReport({ ...t, users: getMockUsers() }, { ...range, bestSellerLimit: REPORT_BEST_SELLER_LIMIT });
  return { todayKey, store_name: t.store_settings.store_name, period: filter.period, from: range.from, to: range.to, ...report };
}
