// services/orderHistoryService.js
// Step 5.4 · FR-17 · FR-19 · FR-20 · BR-08 · UC-11 – UC-13 · C-17 Riwayat Pesanan · C-18 Detail & Tracking
// Hanya pelanggan login dan hanya pesanannya sendiri (pengganti GET/PATCH /api/orders Step 6.3).

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { requireMockRole } from './mock/mockSession';
import { findMyOrder } from './mock/myOrders';
import { cancelOrder } from './mock/orderEffects';
import { MY_ORDER_VIEW_TABLES, orderItemLines, toOrderCard, toOrderDetail } from './mock/myOrderViews';
import { canCancelOrder, paymentRowStatusOnCancel, planReorder } from '../utils/businessRules';
import { ROLES } from '../constants/roles';
import { CANCEL_REASON_MAX_LENGTH } from '../constants/orderHistory';

/**
 * C-17: semua pesanan pelanggan login, terbaru dulu (tab Aktif/Selesai disaring di halaman).
 * @returns {Promise<Array>}
 */
export function getMyOrders() {
  return apiClient('/orders', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const t = getTables('orders', 'order_items', ...MY_ORDER_VIEW_TABLES);
      return t.orders
        .filter((o) => o.user_id === user.user_id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((o) => toOrderCard(o, t));
    },
  });
}

/** C-18: detail, stepper status, info pickup/delivery, pembayaran */
export function getMyOrderDetail(orderNumber) {
  return apiClient(`/orders/${orderNumber}`, {
    mockHandler: () => toOrderDetail(findMyOrder(orderNumber, ...MY_ORDER_VIEW_TABLES)),
  });
}

/**
 * FR-20 · BR-08: batalkan sebelum Sedang Disiapkan. Stok & poin kembali (TF-12), voucher bisa dipakai lagi,
 * pesanan lunas dicatat refunded.
 * @param {string} orderNumber
 * @param {string} reason — orders.cancel_reason
 */
export function cancelMyOrder(orderNumber, reason) {
  return apiClient(`/orders/${orderNumber}/cancel`, {
    method: 'PATCH',
    body: { reason },
    mockHandler: () => {
      const { user, order } = findMyOrder(orderNumber);
      if (!canCancelOrder(order)) throw new Error('Pesanan sudah disiapkan sehingga tidak bisa dibatalkan');
      const cancelReason = String(reason ?? '').trim();
      if (!cancelReason) throw new Error('Tulis alasan pembatalan');
      if (cancelReason.length > CANCEL_REASON_MAX_LENGTH) throw new Error(`Alasan maksimal ${CANCEL_REASON_MAX_LENGTH} karakter`);
      cancelOrder(order, { cancelReason, paymentRowStatus: paymentRowStatusOnCancel(order), changedBy: user.user_id });
      return { order_number: orderNumber };
    },
  });
}

/**
 * FR-19 "Pesan Lagi": item pesanan yang masih tersedia untuk disalin ke keranjang.
 * @param {string} orderNumber
 * @param {Array} cartItems — isi keranjang saat ini (stok ready dihitung bersama isi keranjang)
 * @returns {Promise<{items, skipped}>}
 */
export function getReorderPlan(orderNumber, cartItems) {
  return apiClient(`/orders/${orderNumber}/reorder`, {
    method: 'POST',
    body: { items: cartItems },
    mockHandler: () => {
      const { items, t } = findMyOrder(orderNumber, ...MY_ORDER_VIEW_TABLES);
      return planReorder(orderItemLines(items, t), cartItems);
    },
  });
}
