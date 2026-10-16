// services/loyaltyService.js
// Step 4 · FR-05 · FR-22 · BR-09 — ringkasan poin & level pelanggan yang sedang login
// Hanya membaca transaksi milik pengguna login (tidak pernah menerima user_id dari UI).

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { ROLES } from '../constants/roles';
import {
  getPointBalance, getYearlyEarnedPoints, getMemberLevel, pointsRedeemValue,
} from '../utils/businessRules';

/**
 * @returns {Promise<{balance, redeemValue, yearlyPoints, level, nextLevel, pointsToNext}>}
 */
export function getMyLoyaltySummary() {
  return apiClient('/me/points', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { point_transactions } = getTables('point_transactions');
      const mine = point_transactions.filter((tx) => tx.user_id === user.user_id);
      const balance = getPointBalance(mine);
      // Periode level = tahun kalender berjalan (asumsi TF-11)
      const yearlyPoints = getYearlyEarnedPoints(mine, Number(getMockTodayKey().slice(0, 4)));
      return {
        balance,
        redeemValue: pointsRedeemValue(balance),
        yearlyPoints,
        ...getMemberLevel(yearlyPoints),
      };
    },
  });
}
