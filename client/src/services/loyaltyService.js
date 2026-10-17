// services/loyaltyService.js
// Step 4 · FR-05 · FR-22 · BR-09 — ringkasan poin & level pelanggan yang sedang login
// Hanya membaca transaksi milik pengguna login (tidak pernah menerima user_id dari UI).
// Step 5.5 · FR-22 · FR-23 · C-21: riwayat poin & voucher milik pelanggan.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { ROLES } from '../constants/roles';
import {
  getPointBalance, getYearlyEarnedPoints, getMemberLevel, pointsRedeemValue, getVoucherState, sortVouchersForDisplay,
} from '../utils/businessRules';

/**
 * @returns {Promise<{balance, redeemValue, yearlyPoints, level, nextLevel, pointsToNext}>}
 */
export function getMyLoyaltySummary() {
  return apiClient('/me/points', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { point_transactions, store_settings: settings } = getTables('point_transactions', 'store_settings');
      const mine = point_transactions.filter((tx) => tx.user_id === user.user_id);
      const balance = getPointBalance(mine);
      // Periode level = tahun kalender berjalan (asumsi TF-11)
      const yearlyPoints = getYearlyEarnedPoints(mine, Number(getMockTodayKey().slice(0, 4)));
      return {
        balance,
        redeemValue: pointsRedeemValue(balance, settings),
        yearlyPoints,
        ...getMemberLevel(yearlyPoints, settings),
        // Step 5.8: aturan loyalty yang diatur Owner (AD-09) untuk keterangan level di C-21
        settings: {
          earn_amount_per_point: settings.earn_amount_per_point, gold_min_points: settings.gold_min_points,
          platinum_min_points: settings.platinum_min_points,
        },
      };
    },
  });
}

/**
 * C-21 Riwayat Poin: transaksi poin pelanggan login, terbaru dulu, dengan nomor pesanan terkait.
 * @returns {Promise<Array<{point_tx_id, type, points, created_at, order_number}>>}
 */
export function getMyPointHistory() {
  return apiClient('/me/points/history', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { point_transactions, orders } = getTables('point_transactions', 'orders');
      const numbers = new Map(orders.map((o) => [o.order_id, o.order_number]));
      return point_transactions
        .filter((tx) => tx.user_id === user.user_id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.point_tx_id - a.point_tx_id)
        .map((tx) => ({ ...tx, order_number: tx.order_id ? numbers.get(tx.order_id) ?? null : null }));
    },
  });
}

/**
 * C-21 Voucher (FR-23): voucher yang sudah diklaim pelanggan login + status (bisa dipakai/sudah dipakai/tidak berlaku).
 * @returns {Promise<Array<{claim, voucher, state, product}>>} product: produk khusus voucher (null = semua produk)
 */
export function getMyVouchers() {
  return apiClient('/me/vouchers', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { user_vouchers, vouchers, products } = getTables('user_vouchers', 'vouchers', 'products');
      const todayKey = getMockTodayKey();
      return sortVouchersForDisplay(user_vouchers
        .filter((c) => c.user_id === user.user_id)
        .map((claim) => ({ claim, voucher: vouchers.find((v) => v.voucher_id === claim.voucher_id) }))
        .filter((x) => x.voucher)
        .map((x) => {
          const product = products.find((p) => p.product_id === x.voucher.product_id);
          return {
            ...x,
            state: getVoucherState(x.claim, x.voucher, todayKey),
            product: product ? { product_id: product.product_id, name: product.name, availability_type: product.availability_type } : null,
          };
        }));
    },
  });
}
