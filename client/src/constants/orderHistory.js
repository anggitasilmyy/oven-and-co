// constants/orderHistory.js
// Step 5.4 · FR-17 · FR-19 – FR-21 · BR-07 · BR-08 · BR-11 · C-17 – C-19 — riwayat, tracking, batal, ulasan
// Nilai yang tidak diatur dokumen adalah asumsi prototype (ditandai) dan mudah diganti.

import { ORDER_STATUS } from './orderStatus';

/**
 * Tab C-17 (PRD Batch 5: "Aktif" dan "Selesai").
 * Asumsi prototype: pesanan Dibatalkan ikut tab Selesai karena sudah tidak diproses lagi.
 */
export const ORDER_HISTORY_TAB = { AKTIF: 'aktif', SELESAI: 'selesai' };
export const ORDER_HISTORY_TABS = [
  {
    key: ORDER_HISTORY_TAB.AKTIF,
    label: 'Aktif',
    statuses: [
      ORDER_STATUS.MENUNGGU_PEMBAYARAN, ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN,
      ORDER_STATUS.SIAP_DIAMBIL, ORDER_STATUS.DALAM_PENGIRIMAN,
    ],
    emptyTitle: 'Belum ada pesanan aktif',
    emptyDescription: 'Pesanan yang sedang diproses akan tampil di sini.',
  },
  {
    key: ORDER_HISTORY_TAB.SELESAI,
    label: 'Selesai',
    statuses: [ORDER_STATUS.SELESAI, ORDER_STATUS.DIBATALKAN],
    emptyTitle: 'Belum ada pesanan selesai',
    emptyDescription: 'Pesanan yang sudah selesai atau dibatalkan akan tampil di sini.',
  },
];

/** Subjudul kartu status C-18 (PRD Batch 5: "Pesananmu sedang kami siapkan with care") */
export const ORDER_STATUS_HERO_TEXT = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: 'Selesaikan pembayaran agar pesananmu kami proses.',
  [ORDER_STATUS.DIKONFIRMASI]: 'Pesananmu sudah kami terima dan segera disiapkan.',
  [ORDER_STATUS.SEDANG_DISIAPKAN]: 'Pesananmu sedang kami siapkan with care.',
  [ORDER_STATUS.SIAP_DIAMBIL]: 'Pesananmu siap diambil. Tunjukkan kode pickup di toko.',
  [ORDER_STATUS.DALAM_PENGIRIMAN]: 'Pesananmu sedang dalam perjalanan.',
  [ORDER_STATUS.SELESAI]: 'Pesanan selesai. Terima kasih sudah berbelanja!',
  [ORDER_STATUS.DIBATALKAN]: 'Pesanan ini sudah dibatalkan.',
};

/** Alasan pembatalan pelanggan (FR-20, orders.cancel_reason VARCHAR(255)) */
export const CANCEL_REASON_MAX_LENGTH = 255;

/**
 * Status baris payments saat pelanggan membatalkan pesanan yang belum dibayar.
 * Asumsi prototype: enum payments.status tidak punya "cancelled"; dipakai "failed" (pembayaran tidak terjadi).
 * Pesanan yang sudah lunas dicatat "refunded" (BR-08, SPEC §10 Refund).
 */
export const UNPAID_CANCEL_PAYMENT_STATUS = 'failed';

/** Tracking diperbarui berkala selama pesanan masih aktif (PRD Batch 5: status real time) — asumsi prototype */
export const TRACKING_REFRESH_MS = 30_000;

/** Pesan WhatsApp awal tombol "Hubungi Oven & Co." (F-20) */
export const WHATSAPP_ORDER_MESSAGE = (orderNumber) => `Halo Oven & Co., saya ingin bertanya tentang pesanan ${orderNumber}.`;

/** Tag cepat ulasan (PRD Batch 5: Fresh, Lembut, Packaging Rapi, Tepat Waktu); disimpan di reviews.tags dipisah koma */
export const REVIEW_TAGS = ['Fresh', 'Lembut', 'Packaging Rapi', 'Tepat Waktu'];

/** Validation rule Ulasan: rating 1–5, maks. 3 foto */
export const REVIEW_RATING_MAX = 5;
export const REVIEW_MAX_PHOTOS = 3;

/** Foto ulasan — asumsi prototype sama dengan foto referensi custom cake: JPG/PNG/WebP, maks. 5 MB */
export const REVIEW_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Mode mock: foto diperkecil lalu disimpan sebagai data URL (pengganti upload multer Step 6) */
export const REVIEW_PHOTO_PREVIEW = { MAX_SIDE: 480, QUALITY: 0.7 };

/** Label tombol & toast ulasan (PRD Batch 5) */
export const REVIEW_SUCCESS_TEXT = (points) => `Terima kasih atas ulasanmu! +${points} poin`;

/** Alasan item tidak disalin saat "Pesan Lagi" (FR-19: hanya item yang masih tersedia) */
export const REORDER_SKIP_REASON = {
  UNAVAILABLE: 'tidak tersedia lagi',
  // Desain custom cake terikat tanggal siap (custom_cake_designs.ready_date) → harus didesain ulang (BR-02 H+3)
  CUSTOM: 'custom cake perlu didesain ulang',
  SOLD_OUT: 'stok hari ini habis',
};
