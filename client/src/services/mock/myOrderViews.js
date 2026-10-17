// services/mock/myOrderViews.js
// Step 5.4 · FR-17 · FR-19 · C-17 · C-18 — pesanan pelanggan siap tampil (item, foto, tracking, pembayaran)

import { buildCartLines, CART_VIEW_TABLES } from './cartViews';
import {
  buildTrackingSteps, canCancelOrder, canReviewOrder, getUnreviewedItems, buildWhatsAppLink, getOperatingHoursFor,
} from '../../utils/businessRules';
import { PAYMENT_OPTION, PAYMENT_STATUS, ORDER_STATUS } from '../../constants/orderStatus';
import { WHATSAPP_ORDER_MESSAGE } from '../../constants/orderHistory';

/** Tabel yang dibaca halaman riwayat & detail pesanan (selain tabel findMyOrder) */
export const MY_ORDER_VIEW_TABLES = [...CART_VIEW_TABLES, 'reviews', 'order_status_histories', 'operating_hours'];

/**
 * Item pesanan diperkaya data produk terbaru (nama, foto, varian, desain, ketersediaan, stok hari ini).
 * Harga tetap salinan saat pesanan dibuat (order_items.unit_price, SPEC §8).
 */
export function orderItemLines(items, t) {
  const lines = buildCartLines(items.map((i) => ({
    cart_item_id: i.order_item_id, product_id: i.product_id, variant_id: i.variant_id, design_id: i.design_id,
    quantity: i.quantity, note: i.note ?? '', preferred_date: null, price: i.unit_price,
  })), t);
  return lines.map((l, idx) => ({
    ...l, order_item_id: items[idx].order_item_id, unit_price: items[idx].unit_price, line_total: items[idx].unit_price * items[idx].quantity,
  }));
}

/** Baris kartu C-17 */
export function toOrderCard(order, t) {
  const items = t.order_items.filter((i) => i.order_id === order.order_id);
  const lines = orderItemLines(items, t);
  const unreviewed = getUnreviewedItems(items, t.reviews);
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    order_status: order.order_status,
    fulfillment_type: order.fulfillment_type,
    ready_date: order.ready_date,
    time_slot: order.time_slot,
    total: order.total,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    items_summary: lines.map((l) => l.name),
    thumbnails: lines.slice(0, 3).map((l) => ({ name: l.name, image_url: l.image_url })),
    can_review: canReviewOrder(order) && unreviewed.length > 0,
  };
}

/** Data lengkap C-18 */
export function toOrderDetail({ order, payment, items, t }) {
  const settings = t.store_settings;
  const method = t.payment_methods.find((m) => m.method_code === payment?.method_code) ?? null;
  const unreviewed = getUnreviewedItems(items, t.reviews);
  const reviewedIds = new Set(t.reviews.map((r) => r.order_item_id));
  const payAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE;
  const settled = [ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN].includes(order.order_status);
  return {
    order,
    items: orderItemLines(items, t).map((l) => ({ ...l, reviewed: reviewedIds.has(l.order_item_id) })),
    method_name: method?.name ?? null,
    steps: buildTrackingSteps(order, t.order_status_histories.filter((h) => h.order_id === order.order_id)),
    store: {
      address: settings.address ?? null,
      whatsapp_link: buildWhatsAppLink(settings.whatsapp_number, WHATSAPP_ORDER_MESSAGE(order.order_number)),
    },
    // BR-07: Bayar di Toko yang belum lunas harus diambil & dibayar sebelum jam tutup (Step 5.8: jam tutup dari AD-11)
    pay_before_time: payAtStore && order.payment_status === PAYMENT_STATUS.UNPAID && !settled
      ? getOperatingHoursFor(t.operating_hours, order.ready_date).close_time : null,
    can_cancel: canCancelOrder(order),
    can_review: canReviewOrder(order) && unreviewed.length > 0,
  };
}
