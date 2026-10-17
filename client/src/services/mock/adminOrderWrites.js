// services/mock/adminOrderWrites.js
// Step 5.6 · FR-28 · BR-09 · UC-20 · UC-21 · AD-04 — ubah status, verifikasi kode pickup, tandai lunas (mode mock)
// Pengganti PATCH /api/admin/orders/:orderNumber/* (Step 6.4). Semua aturan divalidasi ulang dari data terbaru,
// jadi klik ganda / tab lama ditolak sebelum menulis apa pun (tidak ada riwayat, notifikasi, atau poin ganda).

import { updateTable, nextUserRowId } from './db';
import { getMockCurrentTime } from './mockClock';
import { findAdminOrder } from './adminOrderViews';
import { recordOrderStatus } from './orderEffects';
import { appendNotifications, logMockEmails } from './notifications';
import {
  validateAdminStatusChange, checkPickupCode, checkMarkPaidAtStore, shouldAwardCompletionPoints, pointsEarnedFor,
} from '../../utils/businessRules';
import { buildPointsNotification } from '../../utils/rules/notification';
import { ORDER_STATUS, PAYMENT_STATUS, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { STATUS_NOTE } from '../../constants/adminOrder';

const fail = (message) => { throw new Error(message); };

/** BR-09: 1 poin per Rp 1.000 setelah Selesai — sekali per pesanan (dicek dari point_transactions) */
function awardCompletionPoints(order, now) {
  let awarded = 0;
  updateTable('point_transactions', (rows) => {
    const points = pointsEarnedFor(order.total);
    if (points <= 0 || !shouldAwardCompletionPoints(order, rows)) return rows;
    awarded = points;
    return [...rows, {
      point_tx_id: nextUserRowId(rows, 'point_tx_id'), user_id: order.user_id, type: 'earn',
      points, order_id: order.order_id, review_id: null, created_at: now,
    }];
  });
  if (!awarded) return 0;
  const notice = buildPointsNotification({
    user_id: order.user_id, points: awarded, reason: `pesanan ${order.order_number}`, order_id: order.order_id,
  });
  updateTable('notifications', (rows) => appendNotifications(rows, [notice], now));
  logMockEmails([notice]);
  return awarded;
}

/**
 * Ubah status satu langkah. Stok tidak berubah di sini: stok ready sudah berkurang saat pesanan dibuat (TF-12).
 * @param {string} orderNumber
 * @param {{from: string, to: string, pickup_code?: string, courier_name?: string}} input
 * @returns {{order_number, order_status, points_awarded}}
 */
export function changeAdminOrderStatus(orderNumber, input = {}) {
  const { admin, order } = findAdminOrder(orderNumber);
  const error = validateAdminStatusChange(order, {
    from: input.from, to: input.to, pickupCode: input.pickup_code, courierName: input.courier_name,
  });
  if (error) fail(error);

  const now = getMockCurrentTime().toISOString();
  const courierName = input.to === ORDER_STATUS.DALAM_PENGIRIMAN ? String(input.courier_name).trim() : null;
  const updated = { ...order, order_status: input.to, ...(courierName ? { courier_name: courierName } : {}) };
  updateTable('orders', (rows) => rows.map((o) => (o.order_id === order.order_id ? updated : o)));

  let note = null;
  if (courierName) note = STATUS_NOTE.COURIER(courierName);
  if (input.to === ORDER_STATUS.SELESAI && order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) note = STATUS_NOTE.PICKUP_VERIFIED;
  // Satu riwayat + satu notifikasi status untuk pemilik pesanan (SPEC §4, FR-18)
  recordOrderStatus(updated, input.to, { changedBy: admin.user_id, note, at: now });

  const pointsAwarded = input.to === ORDER_STATUS.SELESAI ? awardCompletionPoints(updated, now) : 0;
  return { order_number: orderNumber, order_status: input.to, points_awarded: pointsAwarded };
}

/**
 * UC-21: cek kode pickup tanpa menulis data. Penyimpanan tetap memeriksa ulang kode saat status Selesai disimpan.
 * @returns {{valid: true}}
 */
export function verifyAdminPickupCode(orderNumber, code) {
  const { order } = findAdminOrder(orderNumber);
  if (order.fulfillment_type !== FULFILLMENT_TYPE.PICKUP) fail('Pesanan ini bukan pickup');
  const error = checkPickupCode(order, code);
  if (error) fail(error);
  return { valid: true };
}

/**
 * FR-28: tandai pembayaran Bayar di Toko lunas — orders.payment_status & payments (status, paid_at) diperbarui
 * bersamaan. Status pesanan tidak berubah sehingga tidak ada riwayat status/notifikasi.
 * @returns {{order_number, payment_status, paid_at}}
 */
export function markAdminOrderPaid(orderNumber) {
  const { order } = findAdminOrder(orderNumber);
  const error = checkMarkPaidAtStore(order);
  if (error) fail(error);
  const paidAt = getMockCurrentTime().toISOString();
  updateTable('orders', (rows) => rows.map((o) => (o.order_id === order.order_id ? { ...o, payment_status: PAYMENT_STATUS.PAID } : o)));
  updateTable('payments', (rows) => rows.map((p) => (p.order_id === order.order_id
    ? { ...p, status: 'paid', paid_at: paidAt, amount: order.total } : p)));
  return { order_number: orderNumber, payment_status: PAYMENT_STATUS.PAID, paid_at: paidAt };
}
