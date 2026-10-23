// utils/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — klasifikasi error REST API (fungsi murni, dipakai services/apiClient & service lain).

import { API_ERROR_CODE, SESSION_STATE } from '../constants/apiErrors';

/**
 * true bila sesi lokal harus dihapus: hanya 401 ber-kode SESSION_INVALID untuk request yang memang membawa token.
 * 403 (peran tidak sesuai) dan 401 lain (mis. sandi salah) TIDAK menghapus sesi.
 */
export function isSessionInvalidResponse(status, body, hadToken) {
  return Boolean(hadToken) && status === 401 && body?.code === API_ERROR_CODE.SESSION_INVALID;
}

/**
 * Keadaan sesi saat respons 401 SESSION_INVALID untuk `sentToken` tiba (Step 6.3, re-review #1–#3).
 * - ACTIVE   : token request masih token aktif → sesi ini yang kedaluwarsa (boleh dihapus, sekali saja)
 * - CLEARED  : sesi sudah dihapus request lain (token tersimpan kosong) → jangan hapus/beri notifikasi lagi
 * - REPLACED : pengguna sudah masuk lagi dengan token berbeda → sesi baru tidak boleh disentuh
 * Token kosong TIDAK pernah dianggap sama dengan token request.
 */
export function classifySessionState(sentToken, currentToken) {
  if (!currentToken) return SESSION_STATE.CLEARED;
  return currentToken === sentToken ? SESSION_STATE.ACTIVE : SESSION_STATE.REPLACED;
}

/**
 * Sumber daya tidak ada: 404, atau 400 khusus id tidak valid (kode INVALID_ID, mis. /produk/abc) — disamakan
 * dengan mode mock yang mengembalikan null. 400 lain (validasi) tetap dianggap error agar tidak tersamar.
 */
export function isMissingResourceError(error) {
  return error?.status === 404 || (error?.status === 400 && error?.code === API_ERROR_CODE.INVALID_ID);
}
