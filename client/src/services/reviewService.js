// services/reviewService.js
// Step 5.1 · FR-09 · C-10 — ringkasan rating & daftar ulasan produk (tanpa ulasan is_hidden)
// Step 5.4 · FR-21 · BR-11 · C-19 — form ulasan per item pesanan Selesai & kirim ulasan (+20 poin)

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getProductReviewViews } from './mock/reviewViews';
import { findMyOrder } from './mock/myOrders';
import { MY_ORDER_VIEW_TABLES, orderItemLines } from './mock/myOrderViews';
import { createMockReview } from './mock/reviewWrites';
import { summarizeRatings, canReviewOrder } from '../utils/businessRules';
import { STORE_SETTINGS_DEFAULT } from '../constants/storeConfig';

/**
 * @param {number|string} productId
 * @returns {Promise<{product, summary, reviews}|null>} null bila produk tidak ada/nonaktif
 */
export function getProductReviews(productId) {
  return apiClient(`/products/${productId}/reviews`, {
    mockHandler: () => {
      const id = Number(productId);
      const tables = getTables('products', 'reviews', 'review_photos', 'order_items', 'product_variants');
      const product = tables.products.find((p) => p.product_id === id && p.is_active);
      if (!product) return null;
      const reviews = getProductReviewViews(id, tables);
      return {
        product: { product_id: product.product_id, name: product.name },
        summary: summarizeRatings(reviews),
        reviews,
      };
    },
  });
}

/**
 * C-19: item pesanan beserta status sudah/belum diulas.
 * @returns {Promise<{order_number, can_review, bonus_points, items}>}
 */
export function getOrderReviewForm(orderNumber) {
  return apiClient(`/orders/${orderNumber}/reviews`, {
    mockHandler: () => {
      const { order, items, t } = findMyOrder(orderNumber, ...MY_ORDER_VIEW_TABLES);
      const reviewed = new Set(t.reviews.map((r) => r.order_item_id));
      return {
        order_number: order.order_number,
        can_review: canReviewOrder(order),
        bonus_points: t.store_settings?.review_bonus_points ?? STORE_SETTINGS_DEFAULT.review_bonus_points,
        items: orderItemLines(items, t).map((l) => ({
          order_item_id: l.order_item_id, product_id: l.product_id, name: l.name, image_url: l.image_url,
          variant_name: l.variant_name, design: l.design, reviewed: reviewed.has(l.order_item_id),
        })),
      };
    },
  });
}

/**
 * FR-21 · BR-11: kirim ulasan satu item (rating 1–5, tag, komentar, maks. 3 foto) → +20 poin.
 * @param {string} orderNumber
 * @param {{order_item_id, rating, tags, comment, photos}} input
 * @returns {Promise<{review_id, points}>}
 */
export function submitReview(orderNumber, input) {
  return apiClient(`/orders/${orderNumber}/reviews`, {
    method: 'POST',
    body: input,
    mockHandler: () => createMockReview(findMyOrder(orderNumber, ...MY_ORDER_VIEW_TABLES), input),
  });
}
