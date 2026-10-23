// utils/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — klasifikasi error REST API (fungsi murni, dipakai services/apiClient & service lain).

import { API_ERROR_CODE } from '../constants/apiErrors';

/**
 * true bila sesi lokal harus dihapus: hanya 401 ber-kode SESSION_INVALID untuk request yang memang membawa token.
 * 403 (peran tidak sesuai) dan 401 lain (mis. sandi salah) TIDAK menghapus sesi.
 */
export function isSessionInvalidResponse(status, body, hadToken) {
  return Boolean(hadToken) && status === 401 && body?.code === API_ERROR_CODE.SESSION_INVALID;
}

/**
 * Sumber daya tidak ada: 404, atau 400 khusus id tidak valid (kode INVALID_ID, mis. /produk/abc) — disamakan
 * dengan mode mock yang mengembalikan null. 400 lain (validasi) tetap dianggap error agar tidak tersamar.
 */
export function isMissingResourceError(error) {
  return error?.status === 404 || (error?.status === 400 && error?.code === API_ERROR_CODE.INVALID_ID);
}
