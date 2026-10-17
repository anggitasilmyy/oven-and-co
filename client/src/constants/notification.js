// constants/notification.js
// Step 5.5 · FR-18 · BR-007 · C-24 Notifikasi — tipe notifikasi (SPEC §8 notifications.type) & teks per status.
// Teks dipakai SEMUA sumber perubahan status (pelanggan, sistem, dan admin di Step 5.6) agar istilahnya konsisten.

import { ORDER_STATUS } from './orderStatus';

/** notifications.type */
export const NOTIFICATION_TYPE = {
  ORDER_STATUS: 'order_status',
  PROMO: 'promo',
  POINTS: 'points',
};

/**
 * Judul & isi notifikasi perubahan status (notifications.title ≤ 100, body ≤ 255 karakter).
 * `{order}` diganti nomor pesanan; Siap Diambil menyebut kode pickup bila ada.
 */
export const ORDER_STATUS_NOTIFICATION = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: {
    title: 'Pesanan dibuat',
    body: 'Pesanan {order} menunggu pembayaran. Selesaikan pembayaran sebelum batas waktu.',
  },
  [ORDER_STATUS.DIKONFIRMASI]: {
    title: 'Pesanan dikonfirmasi',
    body: 'Pesanan {order} sudah kami terima dan akan segera diproses.',
  },
  [ORDER_STATUS.SEDANG_DISIAPKAN]: {
    title: 'Pesanan sedang disiapkan',
    body: 'Pesanan {order} sedang disiapkan oleh tim dapur Oven & Co.',
  },
  [ORDER_STATUS.SIAP_DIAMBIL]: {
    title: 'Pesanan siap diambil',
    body: 'Pesanan {order} siap diambil di toko. Tunjukkan kode pickup saat mengambil.',
  },
  [ORDER_STATUS.DALAM_PENGIRIMAN]: {
    title: 'Pesanan dalam pengiriman',
    body: 'Pesanan {order} sedang diantar kurir ke alamatmu.',
  },
  [ORDER_STATUS.SELESAI]: {
    title: 'Pesanan selesai',
    body: 'Pesanan {order} selesai. Terima kasih! Beri ulasan untuk mendapatkan bonus poin.',
  },
  [ORDER_STATUS.DIBATALKAN]: {
    title: 'Pesanan dibatalkan',
    body: 'Pesanan {order} dibatalkan.',
  },
};

/** Batas panjang kolom notifications (SPEC §8) */
export const NOTIFICATION_TITLE_MAX = 100;
export const NOTIFICATION_BODY_MAX = 255;

/** Kelompok daftar C-24 (PRD Batch 5: "Hari ini" dan "Sebelumnya") */
export const NOTIFICATION_GROUP = {
  TODAY: { key: 'today', label: 'Hari ini' },
  EARLIER: { key: 'earlier', label: 'Sebelumnya' },
};

/**
 * Asumsi prototype (TF-14: penyedia email belum ditentukan): di mode mock salinan email notifikasi
 * hanya dicetak ke console, sama seperti OTP (SPEC §10).
 */
export const MOCK_EMAIL_LOG_PREFIX = '[Oven & Co. Mock Email]';
