// utils/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — klasifikasi error REST API (fungsi murni, dipakai services/apiClient & service lain).

import { API_ERROR_CODE, CLIENT_ERROR_CODE, HTTP_METHOD } from '../constants/apiErrors';

/**
 * true bila sesi lokal harus dihapus: hanya 401 ber-kode SESSION_INVALID untuk request yang memang membawa token.
 * 403 (peran tidak sesuai) dan 401 lain (mis. sandi salah) TIDAK menghapus sesi.
 */
export function isSessionInvalidResponse(status, body, hadToken) {
  return Boolean(hadToken) && status === 401 && body?.code === API_ERROR_CODE.SESSION_INVALID;
}

/** Error HTTP terstruktur (dipakai apiClient untuk respons server maupun kegagalan sesi buatan frontend) */
export function createApiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (typeof code === 'string') error.code = code;
  return error;
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

/** Error sesi buatan frontend (berakhir/berganti) — data milik sesi sebelumnya harus dibuang (useServiceQuery) */
export function isSessionError(error) {
  return Object.values(CLIENT_ERROR_CODE).includes(error?.code);
}
