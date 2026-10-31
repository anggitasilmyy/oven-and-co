// services/adminReview.service.js
// Step 6.4.8 · FR-35 · UC-25 · BR-11 · AD-10 tab "Ulasan" (Staf & Owner). Kontrak = client
// services/adminCustomerService.js (mock customerAdmin.js): getAdminReviews → { rows, summary }, replyReview,
// setReviewHidden. Admin melihat SEMUA ulasan, termasuk yang disembunyikan. Efek di web pelanggan sudah ditangani
// productView.service.js: balasan tampil di C-09/C-10, ulasan tersembunyi tidak tampil dan tidak dihitung di rating
// (juga rating Dashboard AD-02). Ulasan tidak dihapus dan bonus poin ulasan (BR-11) tidak berubah.
//   - Daftar: satu query + relasi dalam satu snapshot baca (readSnapshot.service.js), ringkasan dari daftar yang sama.
//   - Balas/sembunyikan: UPDATE satu baris (atomik) lalu baca ulang di transaksi yang sama. Balasan ganda bersamaan →
//     balasan terakhir yang menang (sama dengan mock; form tidak membawa nilai awal). is_hidden adalah nilai tujuan
//     (bukan toggle), jadi request ganda idempoten. Ulasan tidak ada → 404.

const prisma = require('../lib/prisma');
const { filterAdminReviews, summarizeAdminReviews } = require('./adminCustomerRules.service');
const { runInReadSnapshot } = require('./readSnapshot.service');

const NOT_FOUND_MESSAGE = 'Ulasan tidak ditemukan';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const ADMIN_REVIEW_INCLUDE = Object.freeze({
  user: { select: { name: true } },
  photos: { orderBy: { photoId: 'asc' }, select: { photoUrl: true } },
  orderItem: {
    select: {
      productId: true,
      product: { select: { name: true } },
      variant: { select: { name: true } },
      order: { select: { orderNumber: true } },
    },
  },
});

/** Baris ulasan admin (bentuk mock buildAdminReviewList); nama pengulas lengkap, foto = path unggahan */
function toAdminReviewRow(r) {
  return {
    review_id: String(r.reviewId),
    rating: r.rating,
    tags: r.tags ? r.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    comment: r.comment,
    admin_reply: r.adminReply,
    is_hidden: Boolean(r.isHidden),
    created_at: r.createdAt.toISOString(),
    reviewer_name: r.user?.name ?? 'Pelanggan',
    product_id: r.orderItem?.productId != null ? String(r.orderItem.productId) : null,
    product_name: r.orderItem?.product?.name ?? 'Produk',
    variant_name: r.orderItem?.variant?.name ?? null,
    order_number: r.orderItem?.order?.orderNumber ?? null,
    photos: r.photos.map((p) => p.photoUrl),
  };
}

/** GET /api/admin/reviews?rating= — { rows (terfilter, terbaru dulu), summary (semua ulasan) } */
function getAdminReviews(rating) {
  return runInReadSnapshot(async (tx) => {
    const reviews = await tx.review.findMany({
      orderBy: [{ createdAt: 'desc' }, { reviewId: 'desc' }],
      include: ADMIN_REVIEW_INCLUDE,
    });
    const rows = reviews.map(toAdminReviewRow);
    return { rows: filterAdminReviews(rows, rating), summary: summarizeAdminReviews(rows) };
  });
}

/** UPDATE satu ulasan lalu kembalikan baris admin terbarunya; tidak ada → 404 */
async function updateReview(reviewId, data) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.review.updateMany({ where: { reviewId: BigInt(reviewId) }, data });
    if (count === 0) throw httpError(404, NOT_FOUND_MESSAGE);
    const row = await tx.review.findUnique({ where: { reviewId: BigInt(reviewId) }, include: ADMIN_REVIEW_INCLUDE });
    return toAdminReviewRow(row);
  });
}

/** PUT /api/admin/reviews/:id/reply — simpan/ubah balasan (sudah di-trim validator) */
function replyReview(reviewId, adminReply) {
  return updateReview(reviewId, { adminReply });
}

/** PATCH /api/admin/reviews/:id/hidden — sembunyikan / tampilkan kembali */
function setReviewHidden(reviewId, isHidden) {
  return updateReview(reviewId, { isHidden });
}

module.exports = {
  getAdminReviews,
  replyReview,
  setReviewHidden,
};
