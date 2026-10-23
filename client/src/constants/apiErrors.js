// constants/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — kode error di body respons REST API (sama dengan server/src/utils/businessConstants.js
// API_ERROR_CODE) dan pesan tampilan terkait.

export const API_ERROR_CODE = {
  /** 401: token yang dikirim tidak berlaku (kedaluwarsa/rusak/akun nonaktif) → sesi lokal dihapus */
  SESSION_INVALID: 'SESSION_INVALID',
  /** 400: id sumber daya tidak valid (mis. /produk/abc) → ditampilkan sebagai "tidak ditemukan" */
  INVALID_ID: 'INVALID_ID',
};

export const SESSION_EXPIRED_MESSAGE = 'Sesi kamu sudah berakhir. Silakan masuk kembali.';

/** Notifikasi global setelah sesi dihapus otomatis (SessionExpiredNotice) */
export const SESSION_EXPIRED_NOTICE =
  'Sesi kamu sudah berakhir, jadi kamu keluar otomatis. Masuk lagi untuk melihat keranjang & pesanan akunmu.';

/** Lama notifikasi sesi berakhir tampil (ms) */
export const SESSION_EXPIRED_NOTICE_DURATION = 8000;
