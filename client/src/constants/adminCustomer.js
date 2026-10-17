// constants/adminCustomer.js
// FR-35 · UC-25 · BR-11 · AD-10 Pelanggan & Ulasan — tab, filter ulasan, batas balasan

/** Tab AD-10 (UI/UX Spec Batch 7: tabel pelanggan + daftar ulasan) — disimpan di URL ?tab= */
export const CUSTOMER_ADMIN_TAB = { PELANGGAN: 'pelanggan', ULASAN: 'ulasan' };
export const CUSTOMER_ADMIN_TABS = [
  { key: CUSTOMER_ADMIN_TAB.PELANGGAN, label: 'Pelanggan' },
  { key: CUSTOMER_ADMIN_TAB.ULASAN, label: 'Ulasan' },
];

/** Filter rating ulasan admin: semua atau bintang tepat 5–1 (UI/UX Spec: "Review list with rating filter") */
export const ADMIN_REVIEW_RATING_ALL = 'semua';
export const ADMIN_REVIEW_RATING_FILTERS = [
  { key: ADMIN_REVIEW_RATING_ALL, label: 'Semua' },
  ...[5, 4, 3, 2, 1].map((n) => ({ key: String(n), label: `${n} ★` })),
];

/** Asumsi prototype: balasan admin maks. 500 karakter (reviews.admin_reply bertipe TEXT) */
export const ADMIN_REPLY_MAX = 500;

export const CUSTOMERS_PAGE_SIZE = 10;
export const ADMIN_REVIEWS_PAGE_SIZE = 8;
