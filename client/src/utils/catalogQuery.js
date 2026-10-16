// utils/catalogQuery.js
// Step 5.1 · FR-06 · C-06/C-07 — konversi filter katalog ⇄ parameter URL (fungsi murni)
// Filter disimpan di URL agar chip kategori Beranda (/katalog?kategori=ID) membuka Katalog yang sudah terfilter,
// dan filter tetap ada saat halaman di-refresh atau dibagikan sebagai tautan.

import {
  CATALOG_QUERY_PARAM as P, CATALOG_SORT, DEFAULT_CATALOG_SORT, AVAILABILITY_FILTER,
  MIN_RATING_OPTIONS, PRICE_RANGE,
} from '../constants/catalog';

/** Filter kosong (default) */
export const EMPTY_CATALOG_FILTERS = {
  categoryId: null,
  availability: [],
  minPrice: null,
  maxPrice: null,
  minRating: null,
  sort: DEFAULT_CATALOG_SORT,
};

const toInt = (v) => (/^\d+$/.test(v ?? '') ? Number(v) : null);
const clampPrice = (v) => (v == null ? null : Math.min(Math.max(v, PRICE_RANGE.MIN), PRICE_RANGE.MAX));

/**
 * URLSearchParams → filter. Nilai tidak valid diabaikan (kembali ke default).
 * @param {URLSearchParams} params
 */
export function parseCatalogQuery(params) {
  const availability = (params.get(P.AVAILABILITY) ?? '')
    .split(',')
    .filter((v, i, arr) => Object.values(AVAILABILITY_FILTER).includes(v) && arr.indexOf(v) === i);
  let minPrice = clampPrice(toInt(params.get(P.MIN_PRICE)));
  let maxPrice = clampPrice(toInt(params.get(P.MAX_PRICE)));
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const rating = Number(params.get(P.MIN_RATING));
  const sort = params.get(P.SORT);
  return {
    categoryId: toInt(params.get(P.CATEGORY)),
    availability,
    // Batas slider penuh (0 / 500.000) sama dengan tidak dibatasi
    minPrice: minPrice ? minPrice : null,
    maxPrice: maxPrice != null && maxPrice < PRICE_RANGE.MAX ? maxPrice : null,
    minRating: MIN_RATING_OPTIONS.includes(rating) ? rating : null,
    sort: Object.values(CATALOG_SORT).includes(sort) ? sort : DEFAULT_CATALOG_SORT,
  };
}

/** Filter → objek parameter URL (hanya nilai yang bukan default) */
export function buildCatalogQuery(filters) {
  const query = {};
  if (filters.categoryId != null) query[P.CATEGORY] = String(filters.categoryId);
  if (filters.availability?.length) query[P.AVAILABILITY] = filters.availability.join(',');
  if (filters.minPrice) query[P.MIN_PRICE] = String(filters.minPrice);
  if (filters.maxPrice != null && filters.maxPrice < PRICE_RANGE.MAX) query[P.MAX_PRICE] = String(filters.maxPrice);
  if (filters.minRating != null) query[P.MIN_RATING] = String(filters.minRating);
  if (filters.sort && filters.sort !== DEFAULT_CATALOG_SORT) query[P.SORT] = filters.sort;
  return query;
}
