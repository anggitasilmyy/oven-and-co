// services/productDetailService.js
// Step 5.1 · FR-08 · FR-09 · C-09 — detail produk: galeri, varian, stok, tanggal siap, cuplikan ulasan

import { apiClient } from './apiClient';
import { isMissingResourceError } from '../utils/apiErrors';
import { getTables } from './mock/db';
import { getMockTodayKey, getMockCurrentTime } from './mock/mockClock';
import { buildProductContext, toProductView } from './mock/productViews';
import { getProductReviewViews } from './mock/reviewViews';
import { getEarliestReadyDate, summarizeRatings } from '../utils/businessRules';
import { REVIEW_PREVIEW_LIMIT } from '../constants/productDetail';

const DETAIL_TABLES = [
  'categories', 'products', 'product_images', 'product_variants', 'daily_stocks',
  'reviews', 'review_photos', 'order_items', 'store_settings',
];

/**
 * @param {number|string} productId
 * @returns {Promise<object|null>} null bila produk tidak ada atau nonaktif
 */
export function getProductDetail(productId) {
  return apiClient(`/products/${productId}`, {
    mockHandler: () => {
      const id = Number(productId);
      const todayKey = getMockTodayKey();
      const tables = getTables(...DETAIL_TABLES);
      const product = tables.products.find((p) => p.product_id === id && p.is_active);
      if (!product) return null;

      const reviews = getProductReviewViews(id, tables);
      return {
        ...toProductView(product, buildProductContext(tables, todayKey)),
        description: product.description,
        ingredients: product.ingredients,
        allergens: product.allergens,
        images: tables.product_images
          .filter((img) => img.product_id === id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((img) => img.image_url),
        variants: tables.product_variants.filter((v) => v.product_id === id && v.is_active),
        today_key: todayKey,
        // BR-01/BR-02: dihitung dari lead_time_days & store_settings.preorder_cutoff_time
        earliest_ready_date: getEarliestReadyDate(product, getMockCurrentTime(), tables.store_settings),
        preorder_cutoff_time: tables.store_settings.preorder_cutoff_time ?? null,
        rating_summary: summarizeRatings(reviews),
        review_preview: reviews.slice(0, REVIEW_PREVIEW_LIMIT),
      };
    },
  }).catch((err) => {
    // API: 404 (tidak ada/nonaktif) atau 400 (id tidak valid, mis. /produk/abc) → sama dengan mock (null)
    if (isMissingResourceError(err)) return null;
    throw err;
  });
}
