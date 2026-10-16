// utils/rules/catalog.js
// Filter, urutan, dan pencarian katalog — FR-06 · FR-07 · C-06 – C-08
// Input berupa "product view" dari productService (lihat services/mock/productViews.js).

import { AVAILABILITY_TYPE } from '../../constants/product';
import { AVAILABILITY_FILTER, CATALOG_SORT } from '../../constants/catalog';

/** Ketersediaan: "Ready Hari Ini" = ready dengan sisa stok > 0; "Pre-order" = tipe preorder */
export function matchesAvailability(product, availability = []) {
  if (availability.length === 0) return true;
  return availability.some((value) =>
    value === AVAILABILITY_FILTER.READY_TODAY
      ? product.availability_type === AVAILABILITY_TYPE.READY && product.remaining_today > 0
      : value === AVAILABILITY_FILTER.PREORDER && product.availability_type === AVAILABILITY_TYPE.PREORDER
  );
}

/**
 * Filter katalog. Hanya produk aktif yang pernah lolos (FR-06).
 * @param {{categoryId?, availability?, minPrice?, maxPrice?, minRating?}} filters — null = tidak dibatasi
 */
export function filterCatalog(products, filters = {}) {
  const { categoryId = null, availability = [], minPrice = null, maxPrice = null, minRating = null } = filters;
  return products.filter(
    (p) =>
      p.is_active &&
      (categoryId == null || p.category_id === categoryId) &&
      matchesAvailability(p, availability) &&
      (minPrice == null || p.price >= minPrice) &&
      (maxPrice == null || p.price <= maxPrice) &&
      // Produk tanpa ulasan tidak lolos filter rating minimal
      (minRating == null || (p.rating?.average ?? 0) >= minRating)
  );
}

const byId = (a, b) => a.product_id - b.product_id;
const ratingOf = (p) => p.rating?.average ?? -1;

const COMPARATORS = {
  [CATALOG_SORT.TERLARIS]: (a, b) => (b.sold_count ?? 0) - (a.sold_count ?? 0) || byId(a, b),
  [CATALOG_SORT.HARGA_TERENDAH]: (a, b) => a.price - b.price || byId(a, b),
  [CATALOG_SORT.HARGA_TERTINGGI]: (a, b) => b.price - a.price || byId(a, b),
  [CATALOG_SORT.RATING]: (a, b) =>
    ratingOf(b) - ratingOf(a) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0) || byId(a, b),
};

/** Urutkan katalog tanpa mengubah array asal; urutan tak dikenal → Terlaris */
export function sortCatalog(products, sort) {
  return [...products].sort(COMPARATORS[sort] ?? COMPARATORS[CATALOG_SORT.TERLARIS]);
}

/** Jumlah filter aktif untuk badge tombol Filter (kategori & urutan tidak dihitung) */
export function countActiveFilters(filters = {}) {
  return (
    (filters.availability?.length ?? 0) +
    (filters.minPrice != null || filters.maxPrice != null ? 1 : 0) +
    (filters.minRating != null ? 1 : 0)
  );
}

/** Normalisasi kata kunci: huruf kecil, spasi dirapikan */
export function normalizeQuery(query) {
  return String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** FR-07: setiap kata kunci harus muncul pada nama atau nama kategori produk */
export function matchesSearch(product, query) {
  const terms = normalizeQuery(query).split(' ').filter(Boolean);
  if (terms.length === 0) return false;
  const haystack = `${product.name} ${product.category_name ?? ''}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** Hasil pencarian: produk aktif yang cocok; nama yang diawali kata kunci tampil lebih dulu */
export function searchCatalog(products, query) {
  const q = normalizeQuery(query);
  return products
    .filter((p) => p.is_active && matchesSearch(p, q))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || byId(a, b));
}
