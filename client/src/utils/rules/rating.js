// utils/rules/rating.js
// Ringkasan & filter ulasan — FR-09 · C-10 (averageRating dipindah dari businessRules.js tanpa mengubah perilaku)
// Ulasan is_hidden (disembunyikan admin, FR-35) tidak pernah ditampilkan atau dihitung.

import { REVIEW_FILTER } from '../../constants/productDetail';

/** Ulasan yang boleh tampil ke pelanggan */
export function visibleReviews(reviews) {
  return reviews.filter((r) => !r.is_hidden);
}

/** Rata-rata rating ulasan yang tidak disembunyikan; dibulatkan 1 desimal */
export function averageRating(reviews) {
  const visible = visibleReviews(reviews);
  if (visible.length === 0) return { average: null, count: 0 };
  const sum = visible.reduce((s, r) => s + r.rating, 0);
  return { average: Math.round((sum / visible.length) * 10) / 10, count: visible.length };
}

/**
 * Ringkasan rating C-10: rata-rata, jumlah, distribusi bintang 5→1, dan jumlah ulasan berfoto.
 * @param {Array<{rating, is_hidden, photos?}>} reviews
 */
export function summarizeRatings(reviews) {
  const visible = visibleReviews(reviews);
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = visible.filter((r) => r.rating === stars).length;
    return { stars, count, percent: visible.length ? Math.round((count / visible.length) * 100) : 0 };
  });
  return {
    ...averageRating(visible),
    distribution,
    withPhotoCount: visible.filter((r) => r.photos?.length > 0).length,
  };
}

/** Filter C-10: 'semua', 'foto' (dengan foto), atau '1'–'5' (rating tepat); hasil terbaru dulu */
export function filterReviews(reviews, filter = REVIEW_FILTER.ALL) {
  const visible = visibleReviews(reviews);
  const matched =
    filter === REVIEW_FILTER.WITH_PHOTO
      ? visible.filter((r) => r.photos?.length > 0)
      : /^[1-5]$/.test(String(filter))
        ? visible.filter((r) => r.rating === Number(filter))
        : visible;
  return [...matched].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
