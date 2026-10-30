// services/orderTracking.service.js
// FR-17 · FR-20 · BR-08 · BR-11 · C-17 · C-18 — tracking & aturan aksi pesanan pelanggan (fungsi murni).
// Port server dari client/src/utils/rules/orderTracking.js dengan perilaku yang sama.

const {
  ORDER_STATUS, ORDER_STATUS_LABEL, CANCELLABLE_STATUSES, PAYMENT_OPTION, FULFILLMENT_TYPE,
} = require('../utils/businessConstants');

/** BR-08: pelanggan hanya bisa membatalkan sebelum Sedang Disiapkan */
function canCancelOrder(order) {
  return CANCELLABLE_STATUSES.includes(order?.order_status);
}

/** BR-11: ulasan hanya untuk pesanan Selesai */
function canReviewOrder(order) {
  return order?.order_status === ORDER_STATUS.SELESAI;
}

/** Urutan status satu pesanan (SPEC §4): Bayar di Toko langsung Dikonfirmasi; pickup/delivery beda langkah siap */
function getStatusPath(order) {
  const ready = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? ORDER_STATUS.DALAM_PENGIRIMAN : ORDER_STATUS.SIAP_DIAMBIL;
  return [
    ...(order.payment_option === PAYMENT_OPTION.ONLINE ? [ORDER_STATUS.MENUNGGU_PEMBAYARAN] : []),
    ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN, ready, ORDER_STATUS.SELESAI,
  ];
}

/**
 * Stepper C-18 dengan waktu dari order_status_histories (waktu pertama tiap status).
 * Dibatalkan: langkah yang sempat dilalui + "Dibatalkan".
 * @param {object} order — snake_case (orderView.mapOrder)
 * @param {Array<{status: string, changed_at: string}>} histories
 */
function buildTrackingSteps(order, histories = []) {
  const path = getStatusPath(order);
  const timeOf = new Map();
  [...histories]
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    .forEach((h) => { if (!timeOf.has(h.status)) timeOf.set(h.status, h.changed_at); });
  const step = (status, state) => ({
    status, label: ORDER_STATUS_LABEL[status], state, changed_at: state === 'upcoming' ? null : timeOf.get(status) ?? null,
  });

  if (order.order_status === ORDER_STATUS.DIBATALKAN) {
    const reached = path.filter((s) => timeOf.has(s));
    return [...(reached.length ? reached : [path[0]]).map((s) => step(s, 'done')), step(ORDER_STATUS.DIBATALKAN, 'current')];
  }
  const index = Math.max(0, path.indexOf(order.order_status));
  return path.map((s, i) => {
    if (i < index || (i === index && s === ORDER_STATUS.SELESAI)) return step(s, 'done');
    return step(s, i === index ? 'current' : 'upcoming');
  });
}

/** Tautan WhatsApp — nomor dinormalisasi menjadi digit saja */
function buildWhatsAppLink(phone, text) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

module.exports = {
  canCancelOrder,
  canReviewOrder,
  getStatusPath,
  buildTrackingSteps,
  buildWhatsAppLink,
};
