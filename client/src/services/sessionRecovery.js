// services/sessionRecovery.js
// Step 6.3 · FR-26 · BR-04 — penjaga identitas request API (dipakai services/apiClient).
// Setiap request mencatat snapshot { token, userId, epoch } dari useAuthStore (satu-satunya sumber token). Sesi
// request = token + epoch sesi (services/sessionScope): sesi dianggap SAMA hanya bila token sama dan tidak ada
// pergantian sesi di antaranya (temuan L6 — keluar lalu masuk lagi tetap sesi baru walau pengguna/tokennya sama).
// Aturan yang SAMA dipakai sebelum mengirim, setelah respons, dan di mode mock:
//   - sesi sama                 → respons dipakai; 401 SESSION_INVALID = sesi INI kedaluwarsa (dihapus sekali,
//                                 notifikasi sekali); fallback tamu hanya untuk operasi yang secara eksplisit
//                                 `guestFallback`.
//   - sesi sudah kosong         → 401: pesan kedaluwarsa (tanpa notifikasi kedua, tanpa fallback); respons dibuang.
//   - sesi lain, pengguna sama  → respons sesi lama TIDAK dipakai; hanya GET yang dikirim (ulang) SEKALI di sesi aktif.
//                                 POST/PUT/PATCH/DELETE ditolak (CLIENT_SESSION_CHANGED).
//   - sesi lain, pengguna lain/tidak diketahui → respons dibuang, tidak pernah diulang (CLIENT_SESSION_CHANGED).
//   - request tanpa token (tamu/publik) → respons selalu dipakai (tidak ada identitas yang dilindungi).
//   - perubahan profil saja (nama, email; token sama) bukan pergantian sesi (temuan M1).
// Request yang ditolak dengan 401 SESSION_INVALID belum menulis data (middleware auth berjalan sebelum handler route).

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { syncSessionFromStorage } from './sessionSync';
import { getSessionEpoch } from './sessionScope';
import { isSessionInvalidResponse, createApiError, canRetryWithReplacedSession } from '../utils/apiErrors';
import { getSessionUserId } from '../utils/sessionIdentity';
import {
  SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE, CLIENT_ERROR_CODE, HTTP_METHOD,
} from '../constants/apiErrors';

/** Error 401 sesi buatan frontend: pesan & kode (CLIENT_ERROR_CODE) selalu sepasang */
export function sessionError(code) {
  const message = code === CLIENT_ERROR_CODE.SESSION_CHANGED ? SESSION_CHANGED_MESSAGE : SESSION_EXPIRED_MESSAGE;
  return createApiError(message, 401, code);
}

/**
 * Sesi tab ini saat ini → { token, userId, user, epoch } (userId/user null bila tamu / tidak diketahui).
 * `user` dipakai handler mode mock agar bekerja atas nama identitas saat request DIMULAI (temuan H1).
 */
export function takeSessionSnapshot() {
  const { token, user } = useAuthStore.getState();
  return {
    token: token ?? null,
    userId: token ? getSessionUserId(user) : null,
    user: token ? user ?? null : null,
    epoch: getSessionEpoch(),
  };
}

/** Sesi snapshot masih sesi aktif tab ini (token sama dan tidak pernah berganti sejak snapshot) */
function isSameSession(snapshot, current) {
  return current.token === snapshot.token && current.epoch === snapshot.epoch;
}

/** Sesi berganti untuk pengguna yang SAMA: hanya GET yang boleh dijalankan (lagi) di sesi aktif */
function canRunInReplacedSession(method, snapshot, current) {
  return canRetryWithReplacedSession({
    method, sentUserId: snapshot.userId, currentUserId: current.userId, currentToken: current.token,
  });
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
 * - Sesi tidak berubah (termasuk perubahan profil saja) → snapshot sesi sekarang.
 * - Request dimulai sebagai TAMU (belum ada token) → tetap request tamu tanpa token (katalog, /auth/login, dsb.),
 *   walau tab lain baru saja login: tidak ada identitas yang perlu dilindungi.
 * - Sesi berganti untuk pengguna yang sama → GET dikirim di sesi aktif; selain GET DIBATALKAN.
 * - Sesi berganti ke pengguna lain / keluar → DIBATALKAN (body disusun untuk sesi lama).
 * @param {string} [method]
 * @returns {{token: string|null, userId: string|null, user: object|null, epoch: number}}
 */
export function prepareRequestSession(method = HTTP_METHOD.GET) {
  const before = takeSessionSnapshot();
  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  if (isSameSession(before, current)) return current;
  if (!before.token) return { ...current, token: null, userId: null, user: null };
  if (canRunInReplacedSession(method, before, current)) return current;
  throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
}

/**
 * Mode mock (Step 6.3, temuan #3, H1 & L6): aturan sesi yang sama dengan mode API, dijaga di sekitar jeda simulasi.
 * - Request ber-identitas yang sesinya berganti selama jeda → TIDAK dijalankan, kecuali GET pengguna yang sama
 *   (dijalankan atas nama sesi aktif).
 * - Handler menerima `sessionUser` = pengguna sesi request (null untuk tamu), sehingga request tamu yang selesai
 *   setelah ada login tetap tercatat milik tamu, bukan milik pengguna yang baru masuk.
 * @param {(session: {sessionUser: object|null}) => any} run — pemanggil mockHandler
 * @param {number} delayMs — simulasi latensi
 * @param {string} [method]
 */
export async function runMockRequest(run, delayMs, method = HTTP_METHOD.GET) {
  const snapshot = prepareRequestSession(method);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  if (!snapshot.token || isSameSession(snapshot, current)) return run({ sessionUser: snapshot.user });
  if (canRunInReplacedSession(method, snapshot, current)) return run({ sessionUser: current.user });
  throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
}

/** Hasil ulangan (di sesi pengganti) diperiksa sekali lagi; tidak ada ulangan berikutnya */
function settleRetry(result, retrySnapshot) {
  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  const invalid = isSessionInvalidResponse(result.res.status, result.json, retrySnapshot.token);

  if (!isSameSession(retrySnapshot, current)) {
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
 * @param {{token, userId, epoch}} snapshot — sesi saat request dikirim
 * @param {{method: string, guestFallback: boolean, resend: (token: string|null) => Promise<{res, json}>}} options
 * @returns {Promise<{res, json}>}
 */
export async function settleResponse(result, snapshot, { method, guestFallback, resend }) {
  // Request tanpa token (tamu/publik) tidak membawa identitas → hasilnya sah walau sesi berubah saat berjalan
  if (!snapshot.token) return result;

  syncSessionFromStorage();
  const current = takeSessionSnapshot();
  const invalid = isSessionInvalidResponse(result.res.status, result.json, snapshot.token);

  // Sesi tidak berubah selama request
  if (isSameSession(snapshot, current)) {
    if (!invalid) return result;
    clearExpiredSession();
    if (!guestFallback) throw sessionError(CLIENT_ERROR_CODE.SESSION_EXPIRED);
    const guestResult = await resend(null); // satu kali, tanpa token
    syncSessionFromStorage();
    // Pengguna lain masuk saat fallback berjalan → hasil tamu tidak boleh masuk ke sesi barunya
    if (takeSessionSnapshot().token) throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
    return guestResult;
  }

  // Token yang ditolak ternyata masih token aktif (sesi sempat berganti lalu kembali) → token itu kedaluwarsa
  if (invalid && current.token === snapshot.token) {
    clearExpiredSession();
    throw sessionError(CLIENT_ERROR_CODE.SESSION_EXPIRED);
  }

  // Sesi sudah kosong (kedaluwarsa oleh request lain / logout di tab lain): tidak ada fallback, respons lama dibuang
  if (!current.token) {
    throw sessionError(invalid ? CLIENT_ERROR_CODE.SESSION_EXPIRED : CLIENT_ERROR_CODE.SESSION_CHANGED);
  }

  // L6: sesi yang memulai request tidak aktif lagi → responsnya TIDAK dipakai walau id pengguna sama.
  // Hanya GET milik pengguna yang sama yang dikirim ulang SEKALI di sesi aktif.
  if (!canRunInReplacedSession(method, snapshot, current)) throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);
  return settleRetry(await resend(current.token), current);
}
