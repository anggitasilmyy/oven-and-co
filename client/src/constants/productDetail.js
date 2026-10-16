// constants/productDetail.js
// Step 5.1 · FR-08 · FR-09 · C-09 – C-10 — konstanta Detail Produk & Ulasan
// Nilai di sini adalah asumsi prototype (tidak diatur dokumen) dan mudah diganti.

/** Rentang tanggal yang ditampilkan date picker pre-order (hari, termasuk hari ini) */
export const PREORDER_DATE_WINDOW_DAYS = 14;

/** Batas atas stepper untuk produk tanpa stok harian (pre-order); produk ready dibatasi stok */
export const NON_STOCK_MAX_QUANTITY = 99;

/** Panjang maksimal catatan (cart_items.note VARCHAR(255)) */
export const ITEM_NOTE_MAX_LENGTH = 255;

/** Jumlah ulasan pada cuplikan di Detail Produk (UI/UX Spec: 2 kartu) */
export const REVIEW_PREVIEW_LIMIT = 2;

/** Filter ulasan C-10 (UI/UX Spec: Semua, Dengan Foto, 5, 4, 3 — ditambah 2 dan 1 agar semua rating 1–5 bisa difilter) */
export const REVIEW_FILTER = { ALL: 'semua', WITH_PHOTO: 'foto' };
export const REVIEW_FILTER_OPTIONS = [
  { value: REVIEW_FILTER.ALL, label: 'Semua' },
  { value: REVIEW_FILTER.WITH_PHOTO, label: 'Dengan Foto' },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}`, stars: true })),
];
