// constants/orderStatus.js
// Step 2 · Layout & Komponen Dasar
// Sumber: SPEC.md bagian 4

/** @type {Record<string, string>} Kode status pesanan (key = nilai enum DB) */
export const ORDER_STATUS = {
  MENUNGGU_PEMBAYARAN: 'menunggu_pembayaran',
  DIKONFIRMASI: 'dikonfirmasi',
  SEDANG_DISIAPKAN: 'sedang_disiapkan',
  SIAP_DIAMBIL: 'siap_diambil',
  DALAM_PENGIRIMAN: 'dalam_pengiriman',
  SELESAI: 'selesai',
  DIBATALKAN: 'dibatalkan',
};

/** Label tampilan Bahasa Indonesia untuk setiap status */
export const ORDER_STATUS_LABEL = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: 'Menunggu Pembayaran',
  [ORDER_STATUS.DIKONFIRMASI]: 'Dikonfirmasi',
  [ORDER_STATUS.SEDANG_DISIAPKAN]: 'Sedang Disiapkan',
  [ORDER_STATUS.SIAP_DIAMBIL]: 'Siap Diambil',
  [ORDER_STATUS.DALAM_PENGIRIMAN]: 'Dalam Pengiriman',
  [ORDER_STATUS.SELESAI]: 'Selesai',
  [ORDER_STATUS.DIBATALKAN]: 'Dibatalkan',
};

/** Warna Tailwind per status (untuk Badge) */
export const ORDER_STATUS_COLOR = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: 'bg-yellow-100 text-yellow-700',
  [ORDER_STATUS.DIKONFIRMASI]: 'bg-blue-100 text-blue-700',
  [ORDER_STATUS.SEDANG_DISIAPKAN]: 'bg-orange-100 text-orange-700',
  [ORDER_STATUS.SIAP_DIAMBIL]: 'bg-sage text-cocoa',
  [ORDER_STATUS.DALAM_PENGIRIMAN]: 'bg-blue-100 text-blue-700',
  [ORDER_STATUS.SELESAI]: 'bg-sage text-cocoa',
  [ORDER_STATUS.DIBATALKAN]: 'bg-red-100 text-error',
};

/** Status pesanan yang masih bisa dibatalkan pelanggan (sebelum sedang_disiapkan) — BR-08 */
export const CANCELLABLE_STATUSES = [
  ORDER_STATUS.MENUNGGU_PEMBAYARAN,
  ORDER_STATUS.DIKONFIRMASI,
];

/** Urutan transisi status yang valid (admin) */
export const STATUS_TRANSITIONS = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: [ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.DIBATALKAN],
  [ORDER_STATUS.DIKONFIRMASI]: [ORDER_STATUS.SEDANG_DISIAPKAN, ORDER_STATUS.DIBATALKAN],
  [ORDER_STATUS.SEDANG_DISIAPKAN]: [ORDER_STATUS.SIAP_DIAMBIL, ORDER_STATUS.DALAM_PENGIRIMAN],
  [ORDER_STATUS.SIAP_DIAMBIL]: [ORDER_STATUS.SELESAI],
  [ORDER_STATUS.DALAM_PENGIRIMAN]: [ORDER_STATUS.SELESAI],
  [ORDER_STATUS.SELESAI]: [],
  [ORDER_STATUS.DIBATALKAN]: [],
};

/** Status payment */
export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  REFUNDED: 'refunded',
};

/** Tipe fulfillment */
export const FULFILLMENT_TYPE = {
  PICKUP: 'pickup',
  DELIVERY: 'delivery',
};

/** Opsi pembayaran */
export const PAYMENT_OPTION = {
  ONLINE: 'online',
  PAY_AT_STORE: 'pay_at_store',
};
