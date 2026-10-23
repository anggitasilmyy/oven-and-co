// constants/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — kode error di body respons REST API (sama dengan server/src/utils/businessConstants.js
// API_ERROR_CODE) dan pesan tampilan terkait.

export const API_ERROR_CODE = {
  /** 401: token yang dikirim tidak berlaku (kedaluwarsa/rusak/akun nonaktif) → sesi lokal dihapus */
  SESSION_INVALID: 'SESSION_INVALID',
  /** 400: id sumber daya tidak valid (mis. /produk/abc) → ditampilkan sebagai "tidak ditemukan" */
  INVALID_ID: 'INVALID_ID',
};

export const SESSION_EXPIRED_MESSAGE = 'Sesi Anda telah berakhir. Silakan masuk kembali.';

/** Notifikasi global setelah sesi dihapus otomatis (SessionExpiredNotice) — netral untuk semua peran */
export const SESSION_EXPIRED_NOTICE = 'Sesi Anda telah berakhir. Silakan masuk kembali untuk menggunakan fitur akun.';

/** Lama notifikasi sesi berakhir tampil (ms) */
export const SESSION_EXPIRED_NOTICE_DURATION = 8000;
