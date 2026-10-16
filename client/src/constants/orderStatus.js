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

// ── Step 4 · AD-02 & AD-03 ───────────────────────────────────────────────────

/**
 * Status yang dihitung sebagai "Perlu Diproses" di KPI Dashboard (FR-27).
 * Asumsi prototype: pesanan yang sudah dikonfirmasi/sedang disiapkan menunggu tindakan dapur/staf.
 * Menunggu Pembayaran menunggu pelanggan; Siap Diambil/Dalam Pengiriman menunggu serah terima.
 */
export const NEEDS_PROCESSING_STATUSES = [
  ORDER_STATUS.DIKONFIRMASI,
  ORDER_STATUS.SEDANG_DISIAPKAN,
];

/**
 * Tab status di AD-03 (PRD Batch 6: "Siap Diambil/Dikirim" digabung dalam satu tab).
 * `statuses` kosong = semua status.
 */
export const ORDER_STATUS_TABS = [
  { key: 'semua', label: 'Semua', statuses: [] },
  { key: ORDER_STATUS.MENUNGGU_PEMBAYARAN, label: 'Menunggu Pembayaran', statuses: [ORDER_STATUS.MENUNGGU_PEMBAYARAN] },
  { key: ORDER_STATUS.DIKONFIRMASI, label: 'Dikonfirmasi', statuses: [ORDER_STATUS.DIKONFIRMASI] },
  { key: ORDER_STATUS.SEDANG_DISIAPKAN, label: 'Sedang Disiapkan', statuses: [ORDER_STATUS.SEDANG_DISIAPKAN] },
  {
    key: 'siap',
    label: 'Siap Diambil/Dikirim',
    statuses: [ORDER_STATUS.SIAP_DIAMBIL, ORDER_STATUS.DALAM_PENGIRIMAN],
  },
  { key: ORDER_STATUS.SELESAI, label: 'Selesai', statuses: [ORDER_STATUS.SELESAI] },
  { key: ORDER_STATUS.DIBATALKAN, label: 'Dibatalkan', statuses: [ORDER_STATUS.DIBATALKAN] },
];

/**
 * Warna hex per status untuk grafik donut (Recharts tidak memakai kelas Tailwind).
 * Urutan kategori divalidasi untuk keterbacaan buta warna (ΔE adjacent ≥ 7) — kontras rendah
 * kuning/hijau-tosca diimbangi legenda berlabel + jumlah, jadi status tidak hanya dibedakan warna.
 */
export const ORDER_STATUS_CHART_COLOR = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: '#EDA100',
  [ORDER_STATUS.DIKONFIRMASI]: '#2A78D6',
  [ORDER_STATUS.SEDANG_DISIAPKAN]: '#EB6834',
  [ORDER_STATUS.SIAP_DIAMBIL]: '#1BAF7A',
  [ORDER_STATUS.DALAM_PENGIRIMAN]: '#6250D6',
  [ORDER_STATUS.SELESAI]: '#008300',
  [ORDER_STATUS.DIBATALKAN]: '#E34948',
};

/** Label status pembayaran */
export const PAYMENT_STATUS_LABEL = {
  [PAYMENT_STATUS.UNPAID]: 'Belum Lunas',
  [PAYMENT_STATUS.PAID]: 'Lunas',
  [PAYMENT_STATUS.REFUNDED]: 'Refund',
};

/** Label tipe fulfillment */
export const FULFILLMENT_LABEL = {
  [FULFILLMENT_TYPE.PICKUP]: 'Pickup',
  [FULFILLMENT_TYPE.DELIVERY]: 'Delivery',
};
