// constants/checkout.js
// FR-11 – FR-16 · C-12 – C-16 — konstanta keranjang, checkout, dan pembayaran
// Nilai yang tidak diatur dokumen adalah asumsi prototype (ditandai) dan mudah diganti.

/**
 * Slot ambil/antar 2 jam di dalam jam operasional 07.00–20.00 (TF-10).
 * Asumsi prototype: UI/UX Spec memberi contoh 09.00-11.00, 11.00-13.00, 15.00-17.00; slot lain mengisi jam operasional.
 */
export const TIME_SLOTS = [
  { start: '07:00', end: '09:00' },
  { start: '09:00', end: '11:00' },
  { start: '11:00', end: '13:00' },
  { start: '13:00', end: '15:00' },
  { start: '15:00', end: '17:00' },
  { start: '17:00', end: '19:00' },
];

/** Rentang tanggal pada date picker checkout (hari, termasuk hari ini) */
export const CHECKOUT_DATE_WINDOW_DAYS = 14;

/** Kelompok metode bayar (payment_methods.method_group) dan judul tampilan C-14 */
export const PAYMENT_GROUP = { QRIS: 'qris', EWALLET: 'ewallet', VA: 'va', STORE: 'store' };
export const PAYMENT_GROUPS = [
  { key: PAYMENT_GROUP.QRIS, label: 'QRIS' },
  { key: PAYMENT_GROUP.EWALLET, label: 'E-Wallet' },
  { key: PAYMENT_GROUP.VA, label: 'Virtual Account' },
  { key: PAYMENT_GROUP.STORE, label: 'Bayar di Toko' },
];
export const PAY_AT_STORE_METHOD = 'pay_at_store';

/** Teks validation rule Pembayaran & Voucher (SPEC §6) */
export const PAY_AT_STORE_DISABLED_TEXT = 'Tidak tersedia untuk pre-order dan delivery';
export const VOUCHER_INVALID_TEXT = 'Voucher tidak berlaku untuk pesanan ini';

/** Label pembayaran Bayar di Toko pada pesanan (PRD 7.4) */
export const PAY_AT_STORE_LABEL = 'Bayar saat ambil';

/** Langkah "Cara pembayaran" per kelompok metode (simulasi payment gateway, SPEC §10) */
export const PAYMENT_INSTRUCTIONS = {
  [PAYMENT_GROUP.QRIS]: [
    'Buka aplikasi m-banking atau e-wallet yang mendukung QRIS.',
    'Pindai kode QR di atas.',
    'Periksa nama merchant Oven & Co. dan total pembayaran.',
    'Konfirmasi pembayaran, lalu tekan Cek Status Pembayaran.',
  ],
  [PAYMENT_GROUP.EWALLET]: [
    'Buka aplikasi e-wallet yang dipilih.',
    'Pilih menu bayar/transfer ke merchant lalu masukkan kode pembayaran.',
    'Periksa total pembayaran dan konfirmasi.',
    'Kembali ke halaman ini dan tekan Cek Status Pembayaran.',
  ],
  [PAYMENT_GROUP.VA]: [
    'Buka m-banking, internet banking, atau ATM bank yang dipilih.',
    'Pilih menu Transfer → Virtual Account.',
    'Masukkan nomor Virtual Account di atas dan periksa total pembayaran.',
    'Konfirmasi pembayaran, lalu tekan Cek Status Pembayaran.',
  ],
};

/** Prefiks kode bayar simulasi per kelompok (payments.payment_code) */
export const PAYMENT_CODE_PREFIX = { [PAYMENT_GROUP.QRIS]: 'QRIS-SIM-', [PAYMENT_GROUP.EWALLET]: 'EW', [PAYMENT_GROUP.VA]: '8808' };

/** Alasan pembatalan otomatis (BR-06) */
export const PAYMENT_TIMEOUT_CANCEL_REASON = 'Tidak dibayar dalam 30 menit (BR-06)';

/**
 * Review c53a11c (M1): pesanan berhasil dibuat, tetapi halaman pembayaran sempat dipasang ulang (akun keluar lalu
 * masuk lagi sebagai pemilik yang sama) sehingga tidak bisa langsung diarahkan ke halaman berikutnya.
 */
export const orderPlacedNotice = (orderNumber) =>
  `Pesanan ${orderNumber} berhasil dibuat. Lihat dan lanjutkan pembayarannya di menu Pesanan.`;
