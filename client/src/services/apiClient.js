// services/apiClient.js
// Step 3 · Authentication
// Memilih antara mock handler atau fetch REST API berdasarkan VITE_USE_MOCK
// Step 6.3: body FormData (unggah foto) & sesi kedaluwarsa (401 SESSION_INVALID). Lihat handleInvalidSession.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import {
  isSessionInvalidResponse, isDesyncedSessionResponse, classifySessionState, createApiError, getSessionUserId,
  canRetryWithReplacedSession,
} from '../utils/apiErrors';
import { resolveUploadUrl } from '../utils/uploadUrl';
import {
  SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE, SESSION_STATE, CLIENT_ERROR_CODE,
} from '../constants/apiErrors';
import { AUTH_TOKEN_STORAGE_KEY } from '../constants/auth';

// `?? {}`: import.meta.env hanya ada di Vite; fallback agar modul bisa diuji di Node (tests/unit)
const ENV = import.meta.env ?? {};
const USE_MOCK = ENV.VITE_USE_MOCK === 'true';
const API_BASE = ENV.VITE_API_URL ?? 'http://localhost:4000/api';

const readToken = () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

/** Error 401 sesi buatan frontend: pesan & kode (constants/apiErrors CLIENT_ERROR_CODE) selalu sepasang */
function sessionError(code) {
  const message = code === CLIENT_ERROR_CODE.SESSION_CHANGED ? SESSION_CHANGED_MESSAGE : SESSION_EXPIRED_MESSAGE;
  return createApiError(message, 401, code);
}

/**
 * Hapus sesi yang sudah tidak berlaku, kembali ke keranjang tamu (keranjang akun tetap tersimpan di perangkat),
 * dan tandai sessionExpired agar pengguna mendapat notifikasi (SessionExpiredNotice di App.jsx).
 */
function clearExpiredSession() {
  useAuthStore.getState().expireSession();
  useCartStore.getState().resetToGuest();
}

/**
 * Selesaikan token yang ditolak server → CLIENT_ERROR_CODE.SESSION_EXPIRED atau SESSION_CHANGED.
 * localStorage dibagi semua tab, store Zustand milik tab ini saja:
 * - localStorage masih memegang token itu (ACTIVE) atau sudah dikosongkan request/tab lain (CLEARED), dan store
 *   tab ini masih memegang token itu → sesi tab ini dihapus (keranjang kembali ke tamu, notifikasi sekali).
 *   Setelah itu store kosong, sehingga request bersamaan berikutnya tidak memicu notifikasi lagi.
 * - Store tab ini memegang token LAIN, atau localStorage memegang token lain (REPLACED) → sesi baru tidak disentuh.
 * - Store tab ini sudah kosong → salinan token basi di localStorage dibuang tanpa notifikasi.
 */
function settleInvalidSession(sentToken) {
  const state = classifySessionState(sentToken, readToken());
  if (state === SESSION_STATE.REPLACED) return CLIENT_ERROR_CODE.SESSION_CHANGED;

  const storeToken = useAuthStore.getState().token;
  if (storeToken === sentToken) {
    clearExpiredSession();
    return CLIENT_ERROR_CODE.SESSION_EXPIRED;
  }
  if (storeToken) return CLIENT_ERROR_CODE.SESSION_CHANGED;
  if (state === SESSION_STATE.ACTIVE) useAuthStore.getState().logout();
  return CLIENT_ERROR_CODE.SESSION_EXPIRED;
}

/**
 * Respons 401 SESSION_INVALID untuk `token` → hasil akhir { res, json } atau lempar error. Maksimal SATU request
 * ulang per panggilan apiClient (401 SESSION_INVALID dikirim middleware auth sebelum handler route, jadi request
 * yang ditolak belum menulis data).
 * - Sesi kedaluwarsa (dihapus): endpoint tamu → ulang sekali TANPA token; lainnya → error sesi berakhir.
 * - Sesi berganti: hanya GET dari identitas yang sama (user_id awal diketahui = user_id sekarang, token baru masih
 *   aktif) yang diulang dengan token baru. POST/PUT/PATCH/DELETE — termasuk endpoint tamu seperti desain & foto
 *   custom cake — tidak pernah dikirim ulang dengan token pengganti agar data tidak berpindah ke pengguna lain.
 */
async function handleInvalidSession(path, { method, body, token, allowGuest, sentUserId }) {
  const outcome = settleInvalidSession(token);

  if (outcome === CLIENT_ERROR_CODE.SESSION_EXPIRED) {
    if (!allowGuest) throw sessionError(outcome);
    return send(path, { method, body, token: null });
  }

  const activeToken = readToken();
  const { token: storeToken, user } = useAuthStore.getState();
  const retryAllowed = canRetryWithReplacedSession({
    method, sentUserId, currentUserId: getSessionUserId(user), storeToken, activeToken,
  });
  if (!retryAllowed) throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED);

  const retried = await send(path, { method, body, token: activeToken });

  // Ulangan juga ditolak: diproses sekali tanpa ulang lagi; sesi dihapus hanya bila token ulangan masih aktif
  if (isSessionInvalidResponse(retried.res.status, retried.json, activeToken)) {
    throw sessionError(settleInvalidSession(activeToken));
  }

  return retried;
}

/** Path unggahan server (/uploads/...) → URL berdasarkan origin VITE_API_URL; nilai lain apa adanya */
export function toUploadUrl(path) {
  return resolveUploadUrl(path, API_BASE);
}

async function send(path, { method, body, token }) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    // FormData: browser menentukan Content-Type + boundary multipart sendiri
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { res, json };
}

/**
 * Klien API universal.
 * - Mock mode  : meneruskan panggilan ke handler mock (fungsi async).
 * - API mode   : melakukan fetch ke REST API dengan JWT dari localStorage.
 *
 * @param {string} path          - Path relatif, e.g. '/auth/login'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {object|FormData} [options.body]
 * @param {Function} [options.mockHandler] - fungsi async mock(body) → data
 * @param {boolean} [options.allowGuest]   - endpoint juga melayani tamu: bila sesi kedaluwarsa, ulangi tanpa token
 * @returns {Promise<any>}       - data response (sudah di-unwrap)
 * @throws {Error}               - pesan error dari server / mock
 */
export async function apiClient(path, { method = 'GET', body, mockHandler, allowGuest = false } = {}) {
  if (USE_MOCK) {
    if (!mockHandler) {
      throw new Error(`[Mock] Tidak ada handler untuk ${method} ${path}`);
    }
    // Simulasikan latensi jaringan ringan agar UI terasa realistis
    await new Promise((r) => setTimeout(r, 200));
    return mockHandler(body);
  }

  // ── Mode API ───────────────────────────────────────────────────────────────
  // Token & identitas yang dipakai request INI dicatat, agar respons 401 yang terlambat tidak menghapus sesi yang
  // lebih baru dan request tidak pernah diulang atas nama pengguna lain. Identitas dianggap diketahui hanya bila
  // store tab ini memegang token yang sama dengan yang dikirim.
  const token = readToken();
  const { token: storeToken, user } = useAuthStore.getState();
  const sentUserId = token && storeToken === token ? getSessionUserId(user) : null;
  let { res, json } = await send(path, { method, body, token });

  if (isSessionInvalidResponse(res.status, json, token)) {
    ({ res, json } = await handleInvalidSession(path, { method, body, token, allowGuest, sentUserId }));
  } else if (isDesyncedSessionResponse(res.status, token, storeToken)) {
    // Tab lain sudah menghapus token dari localStorage sebelum request ini dikirim (tanpa token); store tab ini
    // masih memegang sesi basi → bersihkan lewat jalur yang sama (notifikasi sekali), tanpa request ulang
    throw sessionError(settleInvalidSession(storeToken));
  }

  if (!res.ok) {
    // Kode HTTP & kode aplikasi (constants/apiErrors) disertakan agar service bisa membedakan
    // "tidak ditemukan" (404 / 400 INVALID_ID) dari gangguan lain
    throw createApiError(json.message ?? `HTTP ${res.status}`, res.status, json.code);
  }
  return json.data ?? json;
}

export { USE_MOCK };
