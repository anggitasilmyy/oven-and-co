// utils/rules/adminOrder.js
// Step 5.6 · FR-28 · UC-20 · UC-21 · AD-04 — aturan ubah status admin, verifikasi kode pickup, tandai lunas (fungsi murni)
// Dipakai service mock (validasi wajib) dan halaman (menonaktifkan tombol). UI tidak pernah menjadi satu-satunya penjaga.

import {
  ORDER_STATUS, ORDER_STATUS_LABEL, STATUS_TRANSITIONS, PAYMENT_STATUS, PAYMENT_OPTION, FULFILLMENT_TYPE,
} from '../../constants/orderStatus';
import { ADMIN_STATUS_FROM, ADMIN_ORDER_ERROR, COURIER_NAME_MAX_LENGTH } from '../../constants/adminOrder';

const FINAL_STATUSES = [ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN];

/**
 * Status berikutnya yang boleh dipilih admin (SPEC §4: berurutan). Sedang Disiapkan bercabang sesuai
 * fulfillment: pickup → Siap Diambil, delivery → Dalam Pengiriman.
 * @returns {string|null} null bila admin tidak bisa mengubah status (menunggu pembayaran, selesai, dibatalkan)
 */
export function getAdminNextStatus(order) {
  if (!ADMIN_STATUS_FROM.includes(order?.order_status)) return null;
  const isDelivery = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY;
  const next = STATUS_TRANSITIONS[order.order_status].find((s) => {
    if (s === ORDER_STATUS.DIBATALKAN) return false;
    if (s === ORDER_STATUS.SIAP_DIAMBIL) return !isDelivery;
    if (s === ORDER_STATUS.DALAM_PENGIRIMAN) return isDelivery;
    return true;
  });
  return next ?? null;
}

/** Kode pickup dinormalisasi: spasi dibuang, huruf besar ("pk 1234" → "PK1234") */
export const normalizePickupCode = (code) => String(code ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * UC-21: verifikasi kode pickup (hanya pesanan pickup berstatus Siap Diambil).
 * @returns {string|null} pesan error, null bila cocok
 */
export function checkPickupCode(order, code) {
  if (order.order_status !== ORDER_STATUS.SIAP_DIAMBIL) return ADMIN_ORDER_ERROR.PICKUP_NOT_READY;
  const input = normalizePickupCode(code);
  if (!input) return ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED;
  if (!order.pickup_code || input !== normalizePickupCode(order.pickup_code)) return ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH;
  return null;
}

/** Pesan bila pesanan belum bisa diselesaikan karena pembayaran (BR-05: Bayar di Toko wajib ditandai lunas) */
export function getUnpaidCompletionError(order) {
  if (order.payment_status === PAYMENT_STATUS.PAID) return null;
  return order.payment_option === PAYMENT_OPTION.PAY_AT_STORE ? ADMIN_ORDER_ERROR.UNPAID_AT_STORE : ADMIN_ORDER_ERROR.UNPAID;
}

/**
 * Validation rule "Status (admin)": berurutan; pickup wajib verifikasi kode; Bayar di Toko wajib lunas sebelum Selesai;
 * Dalam Pengiriman wajib nama kurir (PRD §6.2).
 * @param {object} order — baris orders terbaru
 * @param {{from?: string, to: string, pickupCode?: string, courierName?: string}} change
 *   from: status yang dilihat admin saat menekan tombol (mencegah klik ganda / data basi)
 * @returns {string|null} pesan error, null bila boleh disimpan
 */
export function validateAdminStatusChange(order, { from, to, pickupCode, courierName }) {
  if (FINAL_STATUSES.includes(order.order_status)) return ADMIN_ORDER_ERROR.FINAL(ORDER_STATUS_LABEL[order.order_status]);
  if (from && from !== order.order_status) return ADMIN_ORDER_ERROR.STALE(ORDER_STATUS_LABEL[order.order_status]);
  if (order.order_status === ORDER_STATUS.MENUNGGU_PEMBAYARAN) return ADMIN_ORDER_ERROR.WAITING_PAYMENT;
  const next = getAdminNextStatus(order);
  if (!next || to !== next) return ADMIN_ORDER_ERROR.NOT_SEQUENTIAL(ORDER_STATUS_LABEL[next] ?? '-');

  if (to === ORDER_STATUS.DALAM_PENGIRIMAN) {
    const name = String(courierName ?? '').trim();
    if (!name) return ADMIN_ORDER_ERROR.COURIER_REQUIRED;
    if (name.length > COURIER_NAME_MAX_LENGTH) return ADMIN_ORDER_ERROR.COURIER_TOO_LONG;
  }
  if (to === ORDER_STATUS.SELESAI) {
    const unpaid = getUnpaidCompletionError(order);
    if (unpaid) return unpaid;
    if (order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) return checkPickupCode(order, pickupCode);
  }
  return null;
}

/**
 * FR-28 "tandai pembayaran Bayar di Toko lunas": hanya Bayar di Toko yang belum lunas, saat pelanggan datang
 * mengambil (Siap Diambil — activity diagram 7.3: verifikasi kode, terima pembayaran, lalu Selesai).
 * @returns {string|null} pesan error, null bila boleh
 */
export function checkMarkPaidAtStore(order) {
  if (FINAL_STATUSES.includes(order.order_status)) return ADMIN_ORDER_ERROR.FINAL(ORDER_STATUS_LABEL[order.order_status]);
  if (order.payment_option !== PAYMENT_OPTION.PAY_AT_STORE) return ADMIN_ORDER_ERROR.NOT_PAY_AT_STORE;
  if (order.payment_status === PAYMENT_STATUS.PAID) return ADMIN_ORDER_ERROR.ALREADY_PAID;
  if (order.order_status !== ORDER_STATUS.SIAP_DIAMBIL) return ADMIN_ORDER_ERROR.PAY_NOT_READY;
  return null;
}

/**
 * BR-09: poin penyelesaian hanya sekali per pesanan — false bila sudah ada transaksi earn untuk pesanan ini.
 * @param {Array<{type, order_id}>} pointTransactions
 */
export function shouldAwardCompletionPoints(order, pointTransactions) {
  return !pointTransactions.some((tx) => tx.type === 'earn' && tx.order_id === order.order_id);
}

/**
 * Step 6.3 · AD-03: respons daftar pesanan sesuai kontrak getAdminOrders (adminOrderService)?
 * Dipakai service agar respons yang tidak sesuai menjadi error (ErrorState + Coba lagi), bukan halaman crash.
 * @param {unknown} data
 */
export function isAdminOrderListPage(data) {
  const isCount = (n) => Number.isInteger(n) && n >= 0;
  return Boolean(
    data && typeof data === 'object' &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => row && typeof row === 'object' && typeof row.order_number === 'string') &&
    data.tabCounts && typeof data.tabCounts === 'object' && Object.values(data.tabCounts).every(isCount) &&
    isCount(data.totalFiltered) && isCount(data.pageSize) && data.pageSize > 0 &&
    Number.isInteger(data.page) && data.page >= 1 && Number.isInteger(data.totalPages) && data.totalPages >= data.page
  );
}

/**
 * Step 6.3 · AD-04: respons detail sesuai kontrak getAdminOrderDetail (mock adminOrderViews.toAdminOrderDetail)?
 * Respons yang tidak sesuai menjadi error (ErrorState + Coba lagi), bukan skeleton yang tidak pernah selesai.
 * @param {unknown} data
 */
export function isAdminOrderDetail(data) {
  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return Boolean(
    isObject(data) &&
    isObject(data.order) && typeof data.order.order_number === 'string' && typeof data.order.order_status === 'string' &&
    isObject(data.customer) && isObject(data.payment) && isObject(data.store) && isObject(data.actions) &&
    Array.isArray(data.items) && data.items.every(isObject) &&
    Array.isArray(data.status_log) && data.status_log.every(isObject)
  );
}
