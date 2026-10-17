// constants/adminOrder.js
// Step 5.6 · FR-28 · FR-29 · UC-20 – UC-22 · AD-04 Detail & Verifikasi Pesanan · AD-05 Kalender Produksi
// Teks & kode yang dipakai aturan ubah status admin, tandai lunas, dan kalender produksi.

import { ORDER_STATUS } from './orderStatus';

/**
 * Transisi yang dilakukan ADMIN (PRD §6.2 kolom "Pemicu"). Menunggu Pembayaran → Dikonfirmasi dipicu sistem
 * (webhook payment gateway), dan Dibatalkan oleh admin belum diatur dokumen (alasan & refund) sehingga
 * keduanya tidak tersedia di AD-04. Status tujuan tetap divalidasi terhadap STATUS_TRANSITIONS (SPEC §4).
 */
export const ADMIN_STATUS_FROM = [
  ORDER_STATUS.DIKONFIRMASI,
  ORDER_STATUS.SEDANG_DISIAPKAN,
  ORDER_STATUS.SIAP_DIAMBIL,
  ORDER_STATUS.DALAM_PENGIRIMAN,
];

/** Label tombol & penjelasan modal konfirmasi per status tujuan (validation rule Status admin) */
export const ADMIN_STATUS_ACTION = {
  [ORDER_STATUS.SEDANG_DISIAPKAN]: {
    label: 'Mulai Disiapkan',
    description: 'Pesanan mulai dipanggang atau dikemas. Pelanggan tidak bisa membatalkan pesanan setelah ini.',
  },
  [ORDER_STATUS.SIAP_DIAMBIL]: {
    label: 'Tandai Siap Diambil',
    description: 'Pelanggan diberi tahu bahwa pesanan siap diambil dengan menunjukkan kode pickup.',
  },
  [ORDER_STATUS.DALAM_PENGIRIMAN]: {
    label: 'Kirim Pesanan',
    description: 'Pesanan dibawa kurir ke alamat pelanggan. Isi nama kurir yang mengantar.',
  },
  [ORDER_STATUS.SELESAI]: {
    label: 'Selesaikan Pesanan',
    description: 'Pesanan diterima pelanggan. Poin pelanggan ditambahkan dan ulasan terbuka.',
  },
};

/** orders.courier_name VARCHAR(100) */
export const COURIER_NAME_MAX_LENGTH = 100;

/** Catatan riwayat status (order_status_histories.note VARCHAR(255)) */
export const STATUS_NOTE = {
  PICKUP_VERIFIED: 'Kode pickup terverifikasi',
  COURIER: (name) => `Kurir: ${name}`,
};

/** Pesan validasi ubah status & tandai lunas (dipakai service, ditampilkan apa adanya di UI) */
export const ADMIN_ORDER_ERROR = {
  NOT_FOUND: 'Pesanan tidak ditemukan',
  FINAL: (label) => `Pesanan sudah ${label} sehingga statusnya tidak bisa diubah lagi`,
  WAITING_PAYMENT: 'Pesanan masih menunggu pembayaran pelanggan. Status berubah otomatis setelah lunas.',
  STALE: (label) => `Status pesanan sudah berubah menjadi ${label}. Data dimuat ulang.`,
  NOT_SEQUENTIAL: (label) => `Status harus berurutan. Status berikutnya: ${label}.`,
  COURIER_REQUIRED: 'Isi nama kurir',
  COURIER_TOO_LONG: `Nama kurir maksimal ${COURIER_NAME_MAX_LENGTH} karakter`,
  PICKUP_CODE_REQUIRED: 'Masukkan kode pickup dari pelanggan',
  PICKUP_CODE_MISMATCH: 'Kode pickup tidak cocok. Periksa kembali kode yang ditunjukkan pelanggan.',
  PICKUP_NOT_READY: 'Kode pickup diverifikasi saat pesanan berstatus Siap Diambil',
  UNPAID_AT_STORE: 'Tandai pembayaran Bayar di Toko lunas sebelum menyelesaikan pesanan',
  UNPAID: 'Pesanan belum lunas sehingga belum bisa diselesaikan',
  NOT_PAY_AT_STORE: 'Hanya pesanan Bayar di Toko yang ditandai lunas oleh admin',
  ALREADY_PAID: 'Pembayaran pesanan ini sudah lunas',
  PAY_NOT_READY: 'Pembayaran di toko diterima saat pesanan berstatus Siap Diambil',
};

/**
 * AD-05 · FR-29: status yang dihitung sebagai pekerjaan produksi. Menunggu Pembayaran belum pasti (bisa batal
 * otomatis BR-06) dan Dibatalkan bukan pekerjaan produksi. Selesai tetap tampil sebagai catatan tanggal lampau.
 */
export const PRODUCTION_STATUSES = [
  ORDER_STATUS.DIKONFIRMASI,
  ORDER_STATUS.SEDANG_DISIAPKAN,
  ORDER_STATUS.SIAP_DIAMBIL,
  ORDER_STATUS.DALAM_PENGIRIMAN,
  ORDER_STATUS.SELESAI,
];

/** Nama hari kalender (Senin di kolom pertama, sama dengan operating_hours.day_of_week 1 = Senin) */
export const CALENDAR_WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
