// services/reviewService.js
// Step 5.1 · FR-09 · C-10 — ringkasan rating & daftar ulasan produk (tanpa ulasan is_hidden)

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getProductReviewViews } from './mock/reviewViews';
import { summarizeRatings } from '../utils/businessRules';

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
