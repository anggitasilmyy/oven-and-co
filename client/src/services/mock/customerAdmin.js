// services/mock/customerAdmin.js
// Step 5.8 · FR-35 · UC-25 · BR-11 · AD-10 — pelanggan & moderasi ulasan di mode mock
// Pengganti /api/admin/customers & /api/admin/reviews (Step 6.4). Balasan admin tampil di C-09/C-10;
// ulasan yang disembunyikan tidak tampil dan tidak dihitung di rating pelanggan (rules/rating.js).

import { getTables, updateTable } from './db';
import { getMockTodayKey } from './mockClock';
import { getMockUsers } from './users';
import { buildCustomerRows, filterAdminReviews, validateAdminReply } from '../../utils/businessRules';
import { ROLES } from '../../constants/roles';

const fail = (message) => { throw new Error(message); };

/** Tabel pelanggan: total pesanan, total belanja, level (aturan AD-09), pesanan terakhir */
export function buildAdminCustomerRows() {
  const t = getTables('orders', 'point_transactions', 'store_settings');
  return buildCustomerRows({
    customers: getMockUsers().filter((u) => u.role === ROLES.CUSTOMER),
    orders: t.orders,
    pointTransactions: t.point_transactions,
    settings: t.store_settings,
    year: Number(getMockTodayKey().slice(0, 4)), // periode level = tahun kalender berjalan (TF-11)
  });
}

/** Semua ulasan (termasuk yang disembunyikan) + produk, pengulas, varian, foto, nomor pesanan */
export function buildAdminReviewList(rating) {
  const t = getTables('reviews', 'review_photos', 'order_items', 'orders', 'products', 'product_variants');
  const items = new Map(t.order_items.map((i) => [i.order_item_id, i]));
  const orders = new Map(t.orders.map((o) => [o.order_id, o.order_number]));
  const products = new Map(t.products.map((p) => [p.product_id, p.name]));
  const variants = new Map(t.product_variants.map((v) => [v.variant_id, v.name]));
  const users = new Map(getMockUsers().map((u) => [u.user_id, u.name]));
  const rows = t.reviews.map((r) => {
    const item = items.get(r.order_item_id);
    return {
      review_id: r.review_id,
      rating: r.rating,
      tags: r.tags ? r.tags.split(',').map((x) => x.trim()).filter(Boolean) : [],
      comment: r.comment,
      admin_reply: r.admin_reply,
      is_hidden: Boolean(r.is_hidden),
      created_at: r.created_at,
      reviewer_name: users.get(r.user_id) ?? 'Pelanggan',
      product_id: item?.product_id ?? null,
      product_name: products.get(item?.product_id) ?? 'Produk',
      variant_name: variants.get(item?.variant_id) ?? null,
      order_number: orders.get(item?.order_id) ?? null,
      photos: t.review_photos.filter((p) => p.review_id === r.review_id).map((p) => p.photo_url),
    };
  });
  const summary = { total: rows.length, hidden: rows.filter((r) => r.is_hidden).length, unreplied: rows.filter((r) => !r.admin_reply).length };
  return { rows: filterAdminReviews(rows, rating), summary };
}

function updateReview(reviewId, patch) {
  const { reviews } = getTables('reviews');
  const existing = reviews.find((r) => r.review_id === Number(reviewId)) ?? fail('Ulasan tidak ditemukan');
  const row = { ...existing, ...patch };
  updateTable('reviews', (rows) => rows.map((r) => (r.review_id === row.review_id ? row : r)));
  return row;
}

/** Simpan / ubah balasan admin */
export function saveAdminReply(reviewId, reply) {
  const error = validateAdminReply(reply);
  if (error) fail(error);
  return updateReview(reviewId, { admin_reply: String(reply).trim() });
}

/** Sembunyikan / tampilkan kembali ulasan */
export function setAdminReviewHidden(reviewId, hidden) {
  return updateReview(reviewId, { is_hidden: Boolean(hidden) });
}
