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

/**
 * Respons 401 dari token LAMA tiba setelah pengguna masuk lagi dan permintaan tidak diulang otomatis
 * (POST/PUT/PATCH/DELETE khusus akun). Sesi baru tetap aktif, jadi pesan tidak boleh menyebut sesi berakhir.
 */
export const SESSION_CHANGED_MESSAGE = 'Sesi akun berubah saat permintaan diproses. Silakan ulangi tindakan ini.';

/**
 * Kode error yang dibuat FRONTEND (services/apiClient) untuk kegagalan sesi. Sengaja berbeda dari kode server
 * (API_ERROR_CODE.SESSION_INVALID = "token ditolak server") agar maknanya tidak tercampur.
 */
export const CLIENT_ERROR_CODE = {
  /** Sesi request ini sudah berakhir dan dihapus (atau sudah dihapus request/tab lain) */
  SESSION_EXPIRED: 'CLIENT_SESSION_EXPIRED',
  /** Sesi berganti (masuk lagi / pengguna lain) saat request berjalan; request tidak diulang, sesi baru utuh */
  SESSION_CHANGED: 'CLIENT_SESSION_CHANGED',
};

/** Metode HTTP yang dipakai aturan ulangan sesi (services/sessionRecovery) */
export const HTTP_METHOD = { GET: 'GET' };

/** Notifikasi global setelah sesi dihapus otomatis (SessionExpiredNotice) — netral untuk semua peran */
export const SESSION_EXPIRED_NOTICE = 'Sesi Anda telah berakhir. Silakan masuk kembali untuk menggunakan fitur akun.';

/** Lama notifikasi sesi berakhir tampil (ms) */
export const SESSION_EXPIRED_NOTICE_DURATION = 8000;
