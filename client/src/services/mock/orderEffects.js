// services/mock/orderEffects.js
// Step 5.3 · TF-12 · BR-06 · BR-10 — efek samping pesanan di mode mock: stok ready, kode bayar, pembatalan.
// Perhitungan pembatalan & stok ada di orderCancellation.js (fungsi murni); file ini menulis hasilnya.

import { getTables, updateTable } from './db';
import { applyStockDelta, cancelOrderInTables, CANCELLATION_TABLES } from './orderCancellation';
import { getMockCurrentTime } from './mockClock';
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
  const changed = cancelOrderInTables(getTables(...CANCELLATION_TABLES), order, {
    cancelReason, paymentRowStatus, changedBy, now: getMockCurrentTime(),
  });
  Object.entries(changed).forEach(([name, rows]) => updateTable(name, () => rows));
}
