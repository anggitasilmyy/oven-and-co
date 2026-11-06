// utils/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — klasifikasi error REST API (fungsi murni, dipakai services/apiClient & service lain).

import { API_ERROR_CODE, CLIENT_ERROR_CODE, CLIENT_REQUEST_ERROR_CODE, HTTP_METHOD } from '../constants/apiErrors';

/**
 * true bila sesi lokal harus dihapus: hanya 401 ber-kode SESSION_INVALID untuk request yang memang membawa token.
 * 403 (peran tidak sesuai) dan 401 lain (mis. sandi salah) TIDAK menghapus sesi.
 */
export function isSessionInvalidResponse(status, body, hadToken) {
  return Boolean(hadToken) && status === 401 && body?.code === API_ERROR_CODE.SESSION_INVALID;
}

/** fieldErrors sah = objek biasa { field: pesan } (bentuk server errorHandler & mock) */
const isFieldErrorMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Error HTTP terstruktur (dipakai apiClient untuk respons server maupun kegagalan sesi/jaringan buatan frontend).
 * Step 6.6 (CP1): `fieldErrors` (error validasi per field, kunci sama dengan mock) dan `cause` (error asli, untuk
 * logging internal — tidak pernah ditampilkan) ikut disimpan bila ada.
 * @param {string} message
 * @param {number} status — status HTTP; 0 = tanpa respons HTTP (jaringan)
 * @param {string} [code] — kode aplikasi server (API_ERROR_CODE) atau kode frontend
 * @param {{fieldErrors?: object, cause?: unknown}} [extra]
 */
export function createApiError(message, status, code, { fieldErrors, cause } = {}) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.status = status;
  if (typeof code === 'string') error.code = code;
  if (isFieldErrorMap(fieldErrors)) error.fieldErrors = fieldErrors;
  return error;
}

/** Pembatalan request oleh pemanggil (AbortController) — bukan gangguan jaringan */
export function isAbortError(error) {
  return error?.name === 'AbortError';
}

/** Gagal terhubung ke server (tanpa respons HTTP) — dari apiClient mode API */
export function isNetworkError(error) {
  return error?.code === CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR;
}

// Identitas pengguna kini di utils/sessionIdentity.js (satu sumber); diekspor ulang untuk import lama
export { getSessionUserId } from './sessionIdentity';

/**
 * Re-review #2: request yang tokennya DIGANTI saat berjalan boleh diulang dengan token baru hanya bila
 * GET, identitas awal diketahui (bukan tamu), pengguna saat ini sama, dan token baru ada (token aktif store tab ini
 * setelah disamakan dengan sesi kanonis). Selain itu tidak diulang agar request tidak berpindah identitas.
 */
export function canRetryWithReplacedSession({ method, sentUserId, currentUserId, currentToken }) {
  return (
    String(method).toUpperCase() === HTTP_METHOD.GET &&
    sentUserId !== null &&
    currentUserId === sentUserId &&
    Boolean(currentToken)
  );
}

/**
 * Sumber daya tidak ada: 404, atau 400 khusus id tidak valid (kode INVALID_ID, mis. /produk/abc) — disamakan
 * dengan mode mock yang mengembalikan null. 400 lain (validasi) tetap dianggap error agar tidak tersamar.
 */
export function isMissingResourceError(error) {
  return error?.status === 404 || (error?.status === 400 && error?.code === API_ERROR_CODE.INVALID_ID);
}

/** M1: mutasi sudah berhasil untuk akun sebelumnya (bukan kegagalan transaksi) — ditampilkan sebagai info */
export function isCommittedForOtherSessionError(error) {
  return error?.code === CLIENT_ERROR_CODE.SESSION_CHANGED_COMMITTED;
}

/** Error sesi buatan frontend (berakhir/berganti) — data milik sesi sebelumnya harus dibuang (useServiceQuery) */
export function isSessionError(error) {
  return Object.values(CLIENT_ERROR_CODE).includes(error?.code);
}
