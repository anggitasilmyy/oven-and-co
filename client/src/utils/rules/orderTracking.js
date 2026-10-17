// utils/rules/orderTracking.js
// Step 5.4 · FR-17 · FR-19 – FR-21 · BR-08 · BR-11 · C-17 – C-19 — tracking, batal, Pesan Lagi, ulasan (fungsi murni)

import {
  ORDER_STATUS, ORDER_STATUS_LABEL, CANCELLABLE_STATUSES, PAYMENT_OPTION, PAYMENT_STATUS, FULFILLMENT_TYPE,
} from '../../constants/orderStatus';
import { AVAILABILITY_TYPE } from '../../constants/product';
import {
  REVIEW_TAGS, REVIEW_RATING_MAX, REVIEW_MAX_PHOTOS, REORDER_SKIP_REASON, UNPAID_CANCEL_PAYMENT_STATUS,
} from '../../constants/orderHistory';

/** BR-08: pelanggan hanya bisa membatalkan sebelum Sedang Disiapkan */
export function canCancelOrder(order) {
  return CANCELLABLE_STATUSES.includes(order?.order_status);
}

/** BR-11: ulasan hanya untuk pesanan Selesai */
export function canReviewOrder(order) {
  return order?.order_status === ORDER_STATUS.SELESAI;
}

/** Status baris payments setelah pelanggan membatalkan: lunas → refunded (BR-08), selain itu → failed */
export function paymentRowStatusOnCancel(order) {
  return order.payment_status === PAYMENT_STATUS.PAID ? 'refunded' : UNPAID_CANCEL_PAYMENT_STATUS;
}

/**
 * Urutan status yang dilalui satu pesanan (SPEC §4). Bayar di Toko langsung Dikonfirmasi;
 * pickup → Siap Diambil, delivery → Dalam Pengiriman.
 * @returns {string[]}
 */
export function getStatusPath(order) {
  const ready = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? ORDER_STATUS.DALAM_PENGIRIMAN : ORDER_STATUS.SIAP_DIAMBIL;
  return [
    ...(order.payment_option === PAYMENT_OPTION.ONLINE ? [ORDER_STATUS.MENUNGGU_PEMBAYARAN] : []),
    ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN, ready, ORDER_STATUS.SELESAI,
  ];
}

/**
 * Stepper tracking C-18 dengan waktu dari order_status_histories (FR-17).
 * Pesanan dibatalkan: langkah yang sempat dilalui + langkah "Dibatalkan".
 * @param {object} order
 * @param {Array<{status, changed_at}>} histories — riwayat status pesanan ini
 * @returns {Array<{status, label, state: 'done'|'current'|'upcoming', changed_at: string|null}>}
 */
export function buildTrackingSteps(order, histories = []) {
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

/**
 * BR-11: item pesanan yang belum diulas (satu ulasan per item, reviews.order_item_id UQ).
 * @param {Array} items — order_items
 * @param {Array<{order_item_id}>} reviews
 */
export function getUnreviewedItems(items, reviews) {
  const reviewed = new Set(reviews.map((r) => r.order_item_id));
  return items.filter((i) => !reviewed.has(i.order_item_id));
}

/**
 * Validation rule Ulasan: rating 1–5, tag dari daftar, maks. 3 foto.
 * @returns {string|null} pesan error, null bila valid
 */
export function validateReviewInput({ rating, tags = [], photos = [] }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > REVIEW_RATING_MAX) return `Pilih rating 1–${REVIEW_RATING_MAX} bintang`;
  if (tags.some((t) => !REVIEW_TAGS.includes(t))) return 'Tag ulasan tidak valid';
  if (photos.length > REVIEW_MAX_PHOTOS) return `Maksimal ${REVIEW_MAX_PHOTOS} foto`;
  return null;
}

/**
 * FR-19 "Pesan Lagi": salin item yang masih tersedia ke keranjang.
 * - Produk/varian nonaktif dilewati; custom cake dilewati (desain terikat tanggal siap, harus didesain ulang).
 * - Produk ready dibatasi sisa stok hari ini dikurangi jumlah produk yang sama di keranjang (validation rule Detail produk).
 * - Pre-order memakai tanggal siap tercepat (preferred_date kosong).
 * @param {Array} lines — item pesanan yang sudah diperkaya data produk terbaru (bentuk buildCartLines)
 * @param {Array} cartItems — isi keranjang saat ini
 * @returns {{items: Array, skipped: Array<{name, reason}>}}
 */
export function planReorder(lines, cartItems = []) {
  const used = new Map();
  cartItems.filter((i) => !i.design_id).forEach((i) => used.set(i.product_id, (used.get(i.product_id) ?? 0) + i.quantity));
  const items = [];
  const skipped = [];
  for (const line of lines) {
    if (!line.available) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.UNAVAILABLE }); continue; }
    if (line.availability_type === AVAILABILITY_TYPE.CUSTOM) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.CUSTOM }); continue; }
    let quantity = line.quantity;
    if (line.availability_type === AVAILABILITY_TYPE.READY) {
      quantity = Math.min(quantity, (line.remaining_today ?? 0) - (used.get(line.product_id) ?? 0));
      if (quantity <= 0) { skipped.push({ name: line.name, reason: REORDER_SKIP_REASON.SOLD_OUT }); continue; }
      used.set(line.product_id, (used.get(line.product_id) ?? 0) + quantity);
    }
    items.push({
      product_id: line.product_id, variant_id: line.variant_id ?? null, design_id: null, quantity,
      note: line.note ?? '', preferred_date: null, name: line.name, price: line.unit_price, image_url: line.image_url,
    });
  }
  return { items, skipped };
}

/** Tautan WhatsApp (F-20) — nomor dinormalisasi menjadi digit saja, mis. "+62 812-…" → "62812…" */
export function buildWhatsAppLink(phone, text) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
