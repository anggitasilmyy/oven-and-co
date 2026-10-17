// services/mock/reviewWrites.js
// Step 5.4 · FR-21 · BR-11 · C-19 — simpan ulasan di mode mock (pengganti POST /api/reviews Step 6.3).
// Semua aturan divalidasi ulang di sini; UI hanya mengirim isian pelanggan.

import { updateTable, nextUserRowId } from './db';
import { getMockCurrentTime } from './mockClock';
import { canReviewOrder, getUnreviewedItems, validateReviewInput } from '../../utils/businessRules';
import { STORE_SETTINGS_DEFAULT } from '../../constants/storeConfig';

const fail = (message) => { throw new Error(message); };

/**
 * @param {{user, order, items, t}} found — hasil findMyOrder (dengan tabel reviews & store_settings)
 * @param {{order_item_id, rating, tags, comment, photos}} input — photos: data URL (maks. 3)
 * @returns {{review_id, points}}
 */
export function createMockReview({ user, order, items, t }, input) {
  if (!canReviewOrder(order)) fail('Ulasan hanya bisa diberikan untuk pesanan Selesai');
  const item = items.find((i) => i.order_item_id === Number(input.order_item_id)) ?? fail('Produk tidak ada di pesanan ini');
  if (getUnreviewedItems([item], t.reviews).length === 0) fail('Produk ini sudah kamu ulas');
  const photos = input.photos ?? [];
  const tags = input.tags ?? [];
  const error = validateReviewInput({ rating: input.rating, tags, photos });
  if (error) fail(error);

  const now = getMockCurrentTime().toISOString();
  const points = t.store_settings?.review_bonus_points ?? STORE_SETTINGS_DEFAULT.review_bonus_points;
  const review = {
    review_id: nextUserRowId(t.reviews, 'review_id'),
    user_id: user.user_id,
    order_item_id: item.order_item_id,
    rating: input.rating,
    tags: tags.length ? tags.join(', ') : null,
    comment: String(input.comment ?? '').trim() || null,
    is_hidden: false,
    admin_reply: null,
    created_at: now,
  };
  try {
    // Foto dulu: bila penyimpanan penuh, ulasan & poin tidak tercatat setengah jalan
    if (photos.length) {
      updateTable('review_photos', (rows) => {
        const firstId = nextUserRowId(rows, 'photo_id');
        return [...rows, ...photos.map((url, i) => ({ photo_id: firstId + i, review_id: review.review_id, photo_url: url }))];
      });
    }
  } catch {
    fail('Penyimpanan perangkat penuh. Coba kirim dengan lebih sedikit foto.');
  }
  updateTable('reviews', (rows) => [...rows, review]);
  // BR-11: +20 poin (review_bonus_points) per ulasan
  updateTable('point_transactions', (rows) => [...rows, {
    point_tx_id: nextUserRowId(rows, 'point_tx_id'), user_id: user.user_id, type: 'review_bonus',
    points, order_id: null, review_id: review.review_id, created_at: now,
  }]);
  return { review_id: review.review_id, points };
}
