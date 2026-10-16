// services/dashboardService.js
// Step 4 · FR-27 · AD-02 — Dashboard Owner
// Semua angka dihitung dari tabel yang sama dengan AD-03 & Beranda agar tidak bertentangan.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { getAdminOrderRows } from './mock/orderViews';
import { computeBestSellers } from './productService';
import { ROLES } from '../constants/roles';
import { SALES_WINDOW_DAYS, RECENT_ORDERS_LIMIT, BEST_SELLER_LIMIT } from '../constants/dashboard';
import {
  aggregateDailySales, percentChange, countOrdersByStatus, countNeedsProcessing,
  averageRating, isLowStock,
} from '../utils/businessRules';
import { lastNDateKeys, dateKeyOf } from '../utils/date';

/**
 * @returns {Promise<{todayKey, kpi, salesChart, statusCounts, totalOrders, recentOrders, bestSellers, lowStock}>}
 */
export function getOwnerDashboard() {
  return apiClient('/admin/dashboard', {
    mockHandler: () => {
      requireMockRole(ROLES.OWNER);
      const todayKey = getMockTodayKey();
      const { orders, reviews, raw_materials } = getTables('orders', 'reviews', 'raw_materials');
      // 8 hari agar omzet kemarin tersedia sebagai pembanding hari pertama grafik
      const sales = aggregateDailySales(orders, lastNDateKeys(todayKey, SALES_WINDOW_DAYS + 1));
      const salesChart = sales.slice(1);
      const [yesterday, today] = sales.slice(-2);

      return {
        todayKey,
        kpi: {
          revenueToday: today.revenue,
          revenueChange: percentChange(today.revenue, yesterday.revenue),
          ordersToday: orders.filter((o) => dateKeyOf(o.created_at) === todayKey).length,
          needsProcessing: countNeedsProcessing(orders),
          rating: averageRating(reviews),
        },
        salesChart,
        statusCounts: countOrdersByStatus(orders),
        totalOrders: orders.length,
        recentOrders: getAdminOrderRows().slice(0, RECENT_ORDERS_LIMIT),
        bestSellers: computeBestSellers(BEST_SELLER_LIMIT),
        lowStock: raw_materials.filter(isLowStock),
      };
    },
  });
}
