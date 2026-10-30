// services/reviewService.js
// Step 5.1 · FR-09 · C-10 — ringkasan rating & daftar ulasan produk (tanpa ulasan is_hidden)
// Step 5.4 · FR-21 · BR-11 · C-19 — form ulasan per item pesanan Selesai & kirim ulasan (+20 poin)

import { apiClient, USE_MOCK } from './apiClient';
import { dataUrlToBlob } from '../utils/image';
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
 * Mode API (Step 6.3): foto (data URL hasil kompresi di ReviewPhotosField) dikirim sebagai file multipart `photos`
 * (maks. 3), isian lainnya sebagai string JSON `review` — pola sama dengan foto referensi custom cake.
 * Tanpa foto tetap JSON biasa. Data URL tidak pernah dikirim ke server.
 */
const PHOTO_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function toReviewRequestBody(input) {
  const { photos = [], ...fields } = input;
  if (photos.length === 0) return { ...fields, photos: [] };
  const form = new FormData();
  form.append('review', JSON.stringify(fields));
  photos.forEach((dataUrl, i) => {
    const photo = dataUrlToBlob(dataUrl);
    const extension = PHOTO_EXTENSIONS[photo?.type];
    if (!extension) throw new Error('Foto ulasan tidak bisa dibaca. Pilih ulang foto.');
    form.append('photos', photo, `ulasan-${i + 1}.${extension}`);
  });
  return form;
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
    body: USE_MOCK ? input : toReviewRequestBody(input),
    mockHandler: () => createMockReview(findMyOrder(orderNumber, ...MY_ORDER_VIEW_TABLES), input),
  });
}
