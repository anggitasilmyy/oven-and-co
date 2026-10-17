// services/notificationService.js
// Step 5.5 · FR-18 · UC-18 · C-24 Notifikasi — notifikasi in-app milik pelanggan login (pengganti GET /api/me/notifications).
// Pengguna diambil dari sesi; UI tidak pernah mengirim user_id.

import { apiClient } from './apiClient';
import { getTables, updateTable } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { countUnread } from '../utils/businessRules';
import { ROLES } from '../constants/roles';

const mine = (rows, userId) => rows.filter((n) => n.user_id === userId);

/**
 * @returns {Promise<{items: Array, unread: number, today_key: string}>} terbaru dulu; order_number untuk tautan
 */
export function getMyNotifications() {
  return apiClient('/me/notifications', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const { notifications, orders } = getTables('notifications', 'orders');
      const numbers = new Map(orders.map((o) => [o.order_id, o.order_number]));
      const items = mine(notifications, user.user_id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((n) => ({ ...n, order_number: n.order_id ? numbers.get(n.order_id) ?? null : null }));
      return { items, unread: countUnread(items), today_key: getMockTodayKey() };
    },
  });
}

/** Jumlah belum dibaca (penanda di menu Notifikasi C-20) */
export function getMyUnreadNotificationCount() {
  return apiClient('/me/notifications/unread-count', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      return countUnread(mine(getTables('notifications').notifications, user.user_id));
    },
  });
}

/** Tandai satu notifikasi milik pelanggan login sebagai dibaca */
export function markNotificationRead(notificationId) {
  const id = Number(notificationId);
  return apiClient(`/me/notifications/${id}/read`, {
    method: 'PATCH',
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const found = getTables('notifications').notifications.find((n) => n.notification_id === id && n.user_id === user.user_id);
      if (!found) throw new Error('Notifikasi tidak ditemukan');
      updateTable('notifications', (rows) => rows.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)));
      return { notification_id: id, is_read: true };
    },
  });
}
