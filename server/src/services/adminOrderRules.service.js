// services/adminOrderRules.service.js
// FR-28 · UC-20 · UC-21 · AD-04 — aturan aksi admin pada detail pesanan (fungsi murni).
// Port server dari client/src/utils/rules/adminOrder.js (getAdminNextStatus, normalizePickupCode, checkPickupCode,
// getUnpaidCompletionError, validateAdminStatusChange, checkMarkPaidAtStore) dan constants/adminOrder.js
// (ADMIN_STATUS_FROM, ADMIN_ORDER_ERROR, STATUS_NOTE, COURIER_NAME_MAX_LENGTH) dengan perilaku & pesan sama.
// `order` memakai bentuk snake_case (orderView.mapOrder).

const {
  ORDER_STATUS, ORDER_STATUS_LABEL, PAYMENT_STATUS, PAYMENT_OPTION, FULFILLMENT_TYPE,
} = require('../utils/businessConstants');

// Transisi yang dilakukan ADMIN (PRD §6.2): Menunggu Pembayaran → Dikonfirmasi dipicu sistem; Dibatalkan oleh admin
// belum diatur dokumen — keduanya tidak tersedia di AD-04
const ADMIN_STATUS_FROM = Object.freeze([
  ORDER_STATUS.DIKONFIRMASI,
  ORDER_STATUS.SEDANG_DISIAPKAN,
  ORDER_STATUS.SIAP_DIAMBIL,
  ORDER_STATUS.DALAM_PENGIRIMAN,
]);

const FINAL_STATUSES = Object.freeze([ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN]);

// orders.courier_name VARCHAR(100) (client constants/adminOrder.js COURIER_NAME_MAX_LENGTH)
const COURIER_NAME_MAX_LENGTH = 100;

// Catatan riwayat status (order_status_histories.note) — client constants/adminOrder.js STATUS_NOTE
const STATUS_NOTE = Object.freeze({
  PICKUP_VERIFIED: 'Kode pickup terverifikasi',
  COURIER: (name) => `Kurir: ${name}`,
});

// Sama dengan client constants/adminOrder.js ADMIN_ORDER_ERROR (+ NOT_PICKUP dari mock adminOrderWrites.js)
const ADMIN_ORDER_ERROR = Object.freeze({
  FINAL: (label) => `Pesanan sudah ${label} sehingga statusnya tidak bisa diubah lagi`,
  WAITING_PAYMENT: 'Pesanan masih menunggu pembayaran pelanggan. Status berubah otomatis setelah lunas.',
  STALE: (label) => `Status pesanan sudah berubah menjadi ${label}. Data dimuat ulang.`,
  NOT_SEQUENTIAL: (label) => `Status harus berurutan. Status berikutnya: ${label}.`,
  COURIER_REQUIRED: 'Isi nama kurir',
  COURIER_TOO_LONG: `Nama kurir maksimal ${COURIER_NAME_MAX_LENGTH} karakter`,
  PICKUP_CODE_REQUIRED: 'Masukkan kode pickup dari pelanggan',
  PICKUP_CODE_MISMATCH: 'Kode pickup tidak cocok. Periksa kembali kode yang ditunjukkan pelanggan.',
  PICKUP_NOT_READY: 'Kode pickup diverifikasi saat pesanan berstatus Siap Diambil',
  NOT_PICKUP: 'Pesanan ini bukan pickup',
  UNPAID_AT_STORE: 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan',
  UNPAID: 'Pesanan belum lunas sehingga belum bisa diselesaikan',
  NOT_PAY_AT_STORE: 'Hanya pesanan Bayar di Toko yang ditandai lunas oleh admin',
  ALREADY_PAID: 'Pembayaran pesanan ini sudah lunas',
  PAY_NOT_READY: 'Pembayaran di toko diterima saat pesanan berstatus Siap Diambil',
});

/**
 * Status berikutnya yang boleh dipilih admin (SPEC §4: berurutan). Sedang Disiapkan bercabang sesuai fulfillment:
 * pickup → Siap Diambil, delivery → Dalam Pengiriman.
 * @returns {string|null} null bila admin tidak bisa mengubah status (menunggu pembayaran, selesai, dibatalkan)
 */
function getAdminNextStatus(order) {
  if (!ADMIN_STATUS_FROM.includes(order?.order_status)) return null;
  const isDelivery = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY;
  switch (order.order_status) {
    case ORDER_STATUS.DIKONFIRMASI:
      return ORDER_STATUS.SEDANG_DISIAPKAN;
    case ORDER_STATUS.SEDANG_DISIAPKAN:
      return isDelivery ? ORDER_STATUS.DALAM_PENGIRIMAN : ORDER_STATUS.SIAP_DIAMBIL;
    default:
      return ORDER_STATUS.SELESAI;
  }
}

/** Kode pickup dinormalisasi: spasi dibuang, huruf besar ("pk 1234" → "PK1234") */
const normalizePickupCode = (code) => String(code ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * UC-21: verifikasi kode pickup (hanya pesanan pickup berstatus Siap Diambil).
 * @returns {string|null} pesan error, null bila cocok
 */
function checkPickupCode(order, code) {
  if (order.order_status !== ORDER_STATUS.SIAP_DIAMBIL) return ADMIN_ORDER_ERROR.PICKUP_NOT_READY;
  const input = normalizePickupCode(code);
  if (!input) return ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED;
  if (!order.pickup_code || input !== normalizePickupCode(order.pickup_code)) return ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH;
  return null;
}

/** Pesan bila pesanan belum bisa diselesaikan karena pembayaran (BR-05: Bayar di Toko wajib ditandai lunas) */
function getUnpaidCompletionError(order) {
  if (order.payment_status === PAYMENT_STATUS.PAID) return null;
  return order.payment_option === PAYMENT_OPTION.PAY_AT_STORE ? ADMIN_ORDER_ERROR.UNPAID_AT_STORE : ADMIN_ORDER_ERROR.UNPAID;
}

/**
 * Validation rule "Status (admin)": berurutan; pickup wajib verifikasi kode; Bayar di Toko wajib lunas sebelum Selesai;
 * Dalam Pengiriman wajib nama kurir (PRD §6.2).
 * @param {object} order — baris orders terbaru (snake_case, termasuk pickup_code)
 * @param {{from?: string, to: string, pickupCode?: string, courierName?: string}} change
 *   from: status yang dilihat admin saat menekan tombol (mencegah klik ganda / data basi)
 * @returns {string|null} pesan error, null bila boleh disimpan
 */
function validateAdminStatusChange(order, { from, to, pickupCode, courierName }) {
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
 * FR-28 "tandai pembayaran Bayar di Toko lunas": hanya Bayar di Toko yang belum lunas, saat Siap Diambil.
 * @returns {string|null} pesan error, null bila boleh
 */
function checkMarkPaidAtStore(order) {
  if (FINAL_STATUSES.includes(order.order_status)) return ADMIN_ORDER_ERROR.FINAL(ORDER_STATUS_LABEL[order.order_status]);
  if (order.payment_option !== PAYMENT_OPTION.PAY_AT_STORE) return ADMIN_ORDER_ERROR.NOT_PAY_AT_STORE;
  if (order.payment_status === PAYMENT_STATUS.PAID) return ADMIN_ORDER_ERROR.ALREADY_PAID;
  if (order.order_status !== ORDER_STATUS.SIAP_DIAMBIL) return ADMIN_ORDER_ERROR.PAY_NOT_READY;
  return null;
}

/** Blok `actions` AD-04 (sama dengan client mock/adminOrderViews.js toAdminOrderDetail) */
function buildAdminOrderActions(order) {
  const next = getAdminNextStatus(order);
  return {
    next_status: next,
    // Pesan bila Selesai masih terhalang pembayaran (tombol nonaktif + penjelasan)
    completion_blocked: next === ORDER_STATUS.SELESAI ? getUnpaidCompletionError(order) : null,
    requires_pickup_code: next === ORDER_STATUS.SELESAI && order.fulfillment_type === FULFILLMENT_TYPE.PICKUP,
    requires_courier: next === ORDER_STATUS.DALAM_PENGIRIMAN,
    can_mark_paid: checkMarkPaidAtStore(order) === null,
  };
}

// Pesan karena isian request (400); pesan lain = status pesanan tidak memungkinkan aksi (409)
const INPUT_ERRORS = new Set([
  ADMIN_ORDER_ERROR.COURIER_REQUIRED,
  ADMIN_ORDER_ERROR.COURIER_TOO_LONG,
  ADMIN_ORDER_ERROR.PICKUP_CODE_REQUIRED,
  ADMIN_ORDER_ERROR.PICKUP_CODE_MISMATCH,
]);

/** HTTP status untuk pesan aturan di atas */
const httpStatusForRuleError = (message) => (INPUT_ERRORS.has(message) ? 400 : 409);

module.exports = {
  ADMIN_ORDER_ERROR,
  STATUS_NOTE,
  COURIER_NAME_MAX_LENGTH,
  getAdminNextStatus,
  normalizePickupCode,
  checkPickupCode,
  getUnpaidCompletionError,
  validateAdminStatusChange,
  checkMarkPaidAtStore,
  httpStatusForRuleError,
  buildAdminOrderActions,
};
