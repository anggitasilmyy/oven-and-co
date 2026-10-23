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
 * Re-review #1 (antar-tab): request dikirim TANPA token karena localStorage sudah dikosongkan tab lain, padahal store
 * tab ini masih memegang token (sesi basi). Server menjawab 401 biasa (tanpa kode) → perlakukan sebagai sesi
 * tidak berlaku untuk token di store agar sesi basi tab ini dibersihkan.
 */
export function isDesyncedSessionResponse(status, sentToken, storeTokenAtStart) {
  return status === 401 && !sentToken && Boolean(storeTokenAtStart);
}

/** Error HTTP terstruktur (dipakai apiClient untuk respons server maupun kegagalan sesi buatan frontend) */
export function createApiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (typeof code === 'string') error.code = code;
  return error;
}

/**
 * Identitas pengguna dari objek user di useAuthStore, sebagai string; null bila tidak ada.
 * Mode mock menyimpan `user_id` (angka), REST API (server auth.service publicUser) mengirim `userId` (string).
 */
export function getSessionUserId(user) {
  const id = user?.user_id ?? user?.userId;
  return id === undefined || id === null || id === '' ? null : String(id);
}

/**
 * Re-review #2: request yang tokennya DIGANTI saat berjalan boleh diulang dengan token baru hanya bila
 * GET, identitas awal diketahui (bukan tamu), pengguna saat ini sama, dan token baru masih token aktif
 * (store tab ini & localStorage sepakat). Selain itu tidak diulang agar request tidak berpindah identitas.
 */
export function canRetryWithReplacedSession({ method, sentUserId, currentUserId, storeToken, activeToken }) {
  return (
    String(method).toUpperCase() === 'GET' &&
    sentUserId !== null &&
    currentUserId === sentUserId &&
    Boolean(activeToken) &&
    storeToken === activeToken
  );
}

/**
 * Sumber daya tidak ada: 404, atau 400 khusus id tidak valid (kode INVALID_ID, mis. /produk/abc) — disamakan
 * dengan mode mock yang mengembalikan null. 400 lain (validasi) tetap dianggap error agar tidak tersamar.
 */
export function isMissingResourceError(error) {
  return error?.status === 404 || (error?.status === 400 && error?.code === API_ERROR_CODE.INVALID_ID);
}
