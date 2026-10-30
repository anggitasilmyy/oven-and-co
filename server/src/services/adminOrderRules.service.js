// services/adminOrderRules.service.js
// FR-28 · UC-20 · UC-21 · AD-04 — aturan aksi admin pada detail pesanan (fungsi murni).
// Port server dari client/src/utils/rules/adminOrder.js (getAdminNextStatus, getUnpaidCompletionError,
// checkMarkPaidAtStore) dan constants/adminOrder.js (ADMIN_STATUS_FROM, ADMIN_ORDER_ERROR) dengan perilaku sama.
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

// Sama dengan client constants/adminOrder.js ADMIN_ORDER_ERROR
const ADMIN_ORDER_ERROR = Object.freeze({
  FINAL: (label) => `Pesanan sudah ${label} sehingga statusnya tidak bisa diubah lagi`,
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

/** Pesan bila pesanan belum bisa diselesaikan karena pembayaran (BR-05: Bayar di Toko wajib ditandai lunas) */
function getUnpaidCompletionError(order) {
  if (order.payment_status === PAYMENT_STATUS.PAID) return null;
  return order.payment_option === PAYMENT_OPTION.PAY_AT_STORE ? ADMIN_ORDER_ERROR.UNPAID_AT_STORE : ADMIN_ORDER_ERROR.UNPAID;
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

module.exports = {
  ADMIN_ORDER_ERROR,
  getAdminNextStatus,
  getUnpaidCompletionError,
  checkMarkPaidAtStore,
  buildAdminOrderActions,
};
