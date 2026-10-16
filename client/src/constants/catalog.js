// constants/catalog.js
// Step 5.1 · FR-06 · FR-07 · C-06 – C-08 — pilihan filter, urutan, dan pencarian
// Sumber: PRD F-06/F-07 & UI/UX Spec Batch 2 (Katalog, Filter Bottom Sheet, Pencarian)

/** Urutan katalog (F-06: Terlaris, Harga terendah, Harga tertinggi, Rating) */
export const CATALOG_SORT = {
  TERLARIS: 'terlaris',
  HARGA_TERENDAH: 'harga-terendah',
  HARGA_TERTINGGI: 'harga-tertinggi',
  RATING: 'rating',
};

export const CATALOG_SORT_OPTIONS = [
  { value: CATALOG_SORT.TERLARIS, label: 'Terlaris' },
  { value: CATALOG_SORT.HARGA_TERENDAH, label: 'Harga terendah' },
  { value: CATALOG_SORT.HARGA_TERTINGGI, label: 'Harga tertinggi' },
  { value: CATALOG_SORT.RATING, label: 'Rating' },
];

export const DEFAULT_CATALOG_SORT = CATALOG_SORT.TERLARIS;

/** Filter ketersediaan (UI/UX Spec: chip "Ready Hari Ini" dan "Pre-order") */
export const AVAILABILITY_FILTER = {
  READY_TODAY: 'ready',
  PREORDER: 'preorder',
};

export const AVAILABILITY_FILTER_OPTIONS = [
  { value: AVAILABILITY_FILTER.READY_TODAY, label: 'Ready Hari Ini' },
  { value: AVAILABILITY_FILTER.PREORDER, label: 'Pre-order' },
];

/** Rentang harga slider (UI/UX Spec: Rp 0 – Rp 500.000) */
export const PRICE_RANGE = { MIN: 0, MAX: 500000, STEP: 5000 };

/** Rating minimal (UI/UX Spec: chip "4+" dan "4.5+") */
export const MIN_RATING_OPTIONS = [4, 4.5];

/** Nama parameter URL filter katalog — dipakai juga chip kategori di Beranda (?kategori=ID) */
export const CATALOG_QUERY_PARAM = {
  CATEGORY: 'kategori',
  AVAILABILITY: 'ketersediaan',
  MIN_PRICE: 'harga_min',
  MAX_PRICE: 'harga_max',
  MIN_RATING: 'rating',
  SORT: 'urut',
};

/** Parameter URL kata kunci pencarian (C-08) */
export const SEARCH_QUERY_PARAM = 'q';

/** Chip pencarian populer (UI/UX Spec C-08) */
export const POPULAR_SEARCHES = ['Croissant', 'Birthday Cake', 'Cookies Box'];

/** Riwayat pencarian di perangkat (TF-13) */
export const SEARCH_HISTORY_KEY = 'ovenco_search_history';
export const SEARCH_HISTORY_LIMIT = 8;
