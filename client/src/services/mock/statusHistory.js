// services/mock/statusHistory.js
// Step 5.4 · SPEC §4 · FR-17 — setiap perubahan status dicatat di order_status_histories (fungsi murni).
// Dipakai pembuatan pesanan, simulasi lunas, ganti ke Bayar di Toko, dan pembatalan (pelanggan & otomatis BR-06).
// Sengaja TIDAK mengimpor db.js agar orderCancellation.js tetap bebas circular import.

import { nextUserRowId } from './userRows';

/**
 * Tambahkan baris riwayat status (history_id ≥ USER_ROW_ID_START).
 * @param {Array} rows — order_status_histories saat ini
 * @param {Array<{order_id, status, changed_by?, note?, changed_at}>} entries
 * @returns {Array} rows baru
 */
export function appendStatusHistory(rows, entries) {
  const firstId = nextUserRowId(rows, 'history_id');
  return [
    ...rows,
    ...entries.map((e, i) => ({
      history_id: firstId + i, order_id: e.order_id, status: e.status,
      changed_by: e.changed_by ?? null, note: e.note ?? null, changed_at: e.changed_at,
    })),
  ];
}
