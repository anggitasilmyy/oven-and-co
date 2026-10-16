// services/mock/reviewViews.js
// Step 5.1 · FR-09 · C-09/C-10 — ulasan siap tampil (gabungan reviews, order_items, users, varian, foto)
// Ulasan is_hidden TIDAK pernah dikirim ke halaman pelanggan.

import { getMockUsers } from './users';

/** "Rina Wulandari" → "Rina W." (nama pengulas disingkat) */
function displayName(fullName = '') {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first || 'Pelanggan';
}

/**
 * @param {number} productId
 * @param {object} tables — reviews, review_photos, order_items, product_variants
 * @returns {Array} ulasan tampil milik produk, terbaru dulu
 */
export function getProductReviewViews(productId, tables) {
  const items = new Map(
    tables.order_items.filter((i) => i.product_id === productId).map((i) => [i.order_item_id, i])
  );
  const users = new Map(getMockUsers().map((u) => [u.user_id, u]));
  const variants = new Map(tables.product_variants.map((v) => [v.variant_id, v]));
  return tables.reviews
    .filter((r) => items.has(r.order_item_id) && !r.is_hidden)
    .map((r) => ({
      review_id: r.review_id,
      reviewer_name: displayName(users.get(r.user_id)?.name),
      rating: r.rating,
      tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      comment: r.comment,
      variant_name: variants.get(items.get(r.order_item_id).variant_id)?.name ?? null,
      photos: tables.review_photos.filter((p) => p.review_id === r.review_id).map((p) => p.photo_url),
      admin_reply: r.admin_reply,
      is_hidden: false,
      created_at: r.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
