// services/mock/notifications.js
// Step 5.5 · FR-18 · BR-007 · SPEC §4 — baris tabel notifications di mode mock (pengganti layanan notifikasi Step 6.5).
// appendNotifications murni (dipakai juga pembatalan otomatis BR-06 di getTables), jadi sengaja TIDAK mengimpor db.js.

import { nextUserRowId } from './userRows';
import { getMockUsers } from './users';
import { MOCK_EMAIL_LOG_PREFIX } from '../../constants/notification';

/**
 * Tambahkan notifikasi baru (notification_id ≥ USER_ROW_ID_START, belum dibaca).
 * @param {Array} rows — notifications saat ini
 * @param {Array<{user_id, type, title, body, order_id?}>} entries — hasil buildOrderStatusNotification dkk.
 * @param {string} createdAt — ISO datetime
 * @returns {Array} rows baru
 */
export function appendNotifications(rows, entries, createdAt) {
  const firstId = nextUserRowId(rows, 'notification_id');
  return [
    ...rows,
    ...entries.map((e, i) => ({
      notification_id: firstId + i, user_id: e.user_id, type: e.type, title: e.title, body: e.body,
      order_id: e.order_id ?? null, is_read: false, created_at: createdAt,
    })),
  ];
}

/**
 * FR-18 "in-app + email": penyedia email belum ditentukan (TF-14), jadi di mode mock salinan email hanya
 * dicetak ke console — sama seperti OTP (SPEC §10).
 */
export function logMockEmails(entries) {
  if (!entries.length) return;
  const users = getMockUsers();
  for (const e of entries) {
    const email = users.find((u) => u.user_id === e.user_id)?.email;
    if (email) console.info(`${MOCK_EMAIL_LOG_PREFIX} Kepada: ${email} · ${e.title} — ${e.body}`);
  }
}
