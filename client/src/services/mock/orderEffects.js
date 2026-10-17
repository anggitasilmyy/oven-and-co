// services/mock/orderEffects.js
// Step 5.3 · TF-12 · BR-06 · BR-10 — efek samping pesanan di mode mock: stok ready, kode bayar, pembatalan.
// Perhitungan pembatalan & stok ada di orderCancellation.js (fungsi murni); file ini menulis hasilnya.
// Step 5.5: recordOrderStatus — satu pintu pencatatan perubahan status: riwayat status + notifikasi (SPEC §4, FR-18).

import { getTables, updateTable } from './db';
import { applyStockDelta, cancelOrderInTables, CANCELLATION_TABLES } from './orderCancellation';
import { getMockCurrentTime } from './mockClock';
import { appendStatusHistory } from './statusHistory';
import { appendNotifications, logMockEmails } from './notifications';
import { buildOrderStatusNotification } from '../../utils/rules/notification';
import { PAYMENT_CODE_PREFIX, PAYMENT_GROUP } from '../../constants/checkout';

/** n digit acak (kode pickup & kode bayar simulasi) */
export const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Kode bayar simulasi per kelompok metode (payments.payment_code); Bayar di Toko tanpa kode */
export function paymentCodeFor(method, order) {
  if (method.method_group === PAYMENT_GROUP.STORE) return null;
  if (method.method_group === PAYMENT_GROUP.QRIS) return `${PAYMENT_CODE_PREFIX.qris}${order.order_number}`;
  if (method.method_group === PAYMENT_GROUP.VA) return `${PAYMENT_CODE_PREFIX.va}${randomDigits(10)}`;
  return `${PAYMENT_CODE_PREFIX.ewallet}${randomDigits(8)}`;
}

/**
 * Stok ready berkurang saat pesanan dibuat (sign = 1) dan kembali saat dibatalkan (sign = -1) — TF-12.
 * @param {Array<{product_id, availability_type, quantity}>} lines
 */
export function addStockSold(lines, dateKey, sign) {
  updateTable('daily_stocks', (rows) => applyStockDelta(rows, lines, dateKey, sign));
}

/**
 * Batalkan pesanan: stok ready kembali, voucher bisa dipakai lagi, poin yang ditukar dikembalikan (refund).
 * Logika ada di orderCancellation.js (dipakai juga pemeriksaan kedaluwarsa BR-06 di getTables).
 * @param {object} order
 * @param {{cancelReason: string, paymentRowStatus?: string, changedBy?: number|null}} changes
 *   paymentRowStatus: status baris payments baru · changedBy: pengubah status (Step 5.4, riwayat status)
 */
export function cancelOrder(order, { cancelReason, paymentRowStatus, changedBy = null }) {
  const t = getTables(...CANCELLATION_TABLES);
  const changed = cancelOrderInTables(t, order, {
    cancelReason, paymentRowStatus, changedBy, now: getMockCurrentTime(),
  });
  Object.entries(changed).forEach(([name, rows]) => updateTable(name, () => rows));
  logMockEmails(changed.notifications.slice(t.notifications.length));
}

/**
 * Step 5.5 · SPEC §4: catat perubahan status di order_status_histories DAN kirim notifikasi ke pemilik pesanan.
 * Dipakai pembuatan pesanan, simulasi lunas, ganti ke Bayar di Toko (dan ubah status admin di Step 5.6).
 * @param {object} order — baris orders (sebelum/ sesudah perubahan; yang dipakai id, nomor, pemilik, kode pickup)
 * @param {string} status — status baru
 * @param {{changedBy?: number|null, note?: string|null, at?: string}} [opts] — changedBy null = sistem
 */
export function recordOrderStatus(order, status, { changedBy = null, note = null, at } = {}) {
  const changedAt = at ?? getMockCurrentTime().toISOString();
  updateTable('order_status_histories', (rows) => appendStatusHistory(rows, [{
    order_id: order.order_id, status, changed_by: changedBy, note, changed_at: changedAt,
  }]));
  const notice = buildOrderStatusNotification(order, status, { note });
  updateTable('notifications', (rows) => appendNotifications(rows, [notice], changedAt));
  logMockEmails([notice]);
}
