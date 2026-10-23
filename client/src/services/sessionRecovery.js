// services/sessionRecovery.js
// Step 6.3 · FR-26 · BR-04 — penjaga identitas request API (dipakai services/apiClient).
// Setiap request mencatat snapshot { token, userId } dari useAuthStore (satu-satunya sumber token). Setelah respons
// tiba, sesi disamakan dengan sesi kanonis (services/sessionSync) lalu dibandingkan dengan snapshot:
//   - token sama          → respons dipakai; 401 SESSION_INVALID = sesi INI kedaluwarsa (dihapus sekali, notifikasi
//                           sekali); fallback tamu hanya untuk operasi yang secara eksplisit `guestFallback`.
//   - sesi sudah kosong   → 401: pesan kedaluwarsa (tanpa notifikasi kedua, tanpa fallback); respons lain dibuang.
//   - token lain, user sama → respons sukses tetap milik pengguna itu; 401 → GET boleh diulang SEKALI dengan token baru.
//   - token lain, user lain/tidak diketahui → respons dibuang, tidak pernah diulang (CLIENT_SESSION_CHANGED).
//   - request tanpa token (tamu/publik) → respons selalu dipakai (tidak ada identitas yang dilindungi).
// Request yang ditolak dengan 401 SESSION_INVALID belum menulis data (middleware auth berjalan sebelum handler route).

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { syncSessionFromStorage } from './sessionSync';
import { isSessionInvalidResponse, createApiError, canRetryWithReplacedSession } from '../utils/apiErrors';
import { getSessionUserId } from '../utils/sessionIdentity';
import { SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE, CLIENT_ERROR_CODE } from '../constants/apiErrors';

/** Error 401 sesi buatan frontend: pesan & kode (CLIENT_ERROR_CODE) selalu sepasang */
export function sessionError(code) {
  const message = code === CLIENT_ERROR_CODE.SESSION_CHANGED ? SESSION_CHANGED_MESSAGE : SESSION_EXPIRED_MESSAGE;
  return createApiError(message, 401, code);
}

/** Sesi tab ini saat ini → { token, userId } (userId null bila tamu / tidak diketahui) */
export function takeSessionSnapshot() {
  const { token, user } = useAuthStore.getState();
  return { token: token ?? null, userId: token ? getSessionUserId(user) : null };
}

/**
 * Hapus sesi yang kedaluwarsa, kembali ke keranjang tamu (keranjang akun tetap tersimpan di perangkat), dan tandai
 * sessionExpired (SessionExpiredNotice). Hanya dipanggil bila token yang ditolak MASIH token aktif tab ini, sehingga
 * request bersamaan berikutnya melihat sesi kosong dan tidak memicu notifikasi lagi.
 */
function clearExpiredSession() {
  useAuthStore.getState().expireSession();
  useCartStore.getState().resetToGuest();
}

/**
 * Sebelum mengirim: samakan sesi tab ini dengan sesi kanonis lalu tentukan sesi request.
 * - Sesi tidak berubah → snapshot sesi sekarang.
 * - Request dimulai sebagai TAMU (belum ada token) → tetap request tamu tanpa token (katalog, /auth/login, dsb.),
 *   walau tab lain baru saja login: tidak ada identitas yang perlu dilindungi.
 * - Request dimulai dengan identitas yang kini berubah → DIBATALKAN (body disusun untuk identitas lama).
 * @returns {{token: string|null, userId: string|null}}
 */
export function prepareRequestSession() {
  const before = takeSessionSnapshot();
  if (!syncSessionFromStorage().changed) return takeSessionSnapshot();
  if (!before.token) return { token: null, userId: null };
  throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
}

/**
 * Mode mock (Step 6.3, temuan #3): handler mock membaca pengguna dari useAuthStore saat dijalankan, jadi identitas
 * dijaga di sekitar jeda simulasi. Request dengan identitas yang berubah selama jeda TIDAK dijalankan (data akun
 * lama tidak dihitung/ditampilkan atas nama akun baru); request tamu tetap dijalankan.
 * @param {() => any} run — pemanggil mockHandler
 * @param {number} delayMs — simulasi latensi
 */
export async function runMockRequest(run, delayMs) {
  const snapshot = prepareRequestSession();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  syncSessionFromStorage();
  if (snapshot.token && takeSessionSnapshot().userId !== snapshot.userId) {
    throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
  }
  return run();
}

/** Hasil ulangan (dengan token baru) diperiksa sekali lagi; tidak ada ulangan berikutnya */
function settleRetry(result, retrySnapshot) {
  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  const invalid = isSessionInvalidResponse(result.res.status, result.json, retrySnapshot.token);

  if (current.token !== retrySnapshot.token) {
    throw sessionError(invalid && !current.token ? CLIENT_ERROR_CODE.SESSION_EXPIRED : CLIENT_ERROR_CODE.SESSION_CHANGED);
  }
  if (invalid) {
    clearExpiredSession();
    throw sessionError(CLIENT_ERROR_CODE.SESSION_EXPIRED);
  }
  return result;
}

/**
 * Putuskan hasil akhir request.
 * @param {{res, json}} result — respons pertama
 * @param {{token, userId}} snapshot — sesi saat request dikirim
 * @param {{method: string, guestFallback: boolean, resend: (token: string|null) => Promise<{res, json}>}} options
 * @returns {Promise<{res, json}>}
 */
export async function settleResponse(result, snapshot, { method, guestFallback, resend }) {
  // Request tanpa token (tamu/publik) tidak membawa identitas → hasilnya sah walau sesi berubah saat berjalan
  if (!snapshot.token) return result;

  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  const invalid = isSessionInvalidResponse(result.res.status, result.json, snapshot.token);

  // Identitas tidak berubah selama request
  if (current.token === snapshot.token) {
    if (!invalid) return result;
    clearExpiredSession();
    if (!guestFallback) throw sessionError(CLIENT_ERROR_CODE.SESSION_EXPIRED);
    const guestResult = await resend(null); // satu kali, tanpa token
    syncSessionFromStorage();
    // Pengguna lain masuk saat fallback berjalan → hasil tamu tidak boleh masuk ke sesi barunya
    if (takeSessionSnapshot().token) throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
    return guestResult;
  }

  // Sesi sudah kosong (kedaluwarsa oleh request lain / logout di tab lain): tidak ada fallback, respons lama dibuang
  if (!current.token) {
    throw sessionError(invalid ? CLIENT_ERROR_CODE.SESSION_EXPIRED : CLIENT_ERROR_CODE.SESSION_CHANGED);
  }

  // Token lain: hanya pengguna yang SAMA yang boleh menerima respons / ulangan GET
  const sameUser = snapshot.userId !== null && current.userId === snapshot.userId;
  if (!invalid) {
    if (sameUser) return result;
    throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
  }

  const retryAllowed = canRetryWithReplacedSession({
    method, sentUserId: snapshot.userId, currentUserId: current.userId, currentToken: current.token,
  });
  if (!retryAllowed) throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);

  return settleRetry(await resend(current.token), current);
}
