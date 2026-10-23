// services/apiClient.js
// Step 3 · Authentication
// Memilih antara mock handler atau fetch REST API berdasarkan VITE_USE_MOCK
// Step 6.3: body FormData (unggah foto) & sesi kedaluwarsa (401 SESSION_INVALID). Lihat handleInvalidSession.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { isSessionInvalidResponse, classifySessionState } from '../utils/apiErrors';
import { resolveUploadUrl } from '../utils/uploadUrl';
import { SESSION_EXPIRED_MESSAGE, SESSION_CHANGED_MESSAGE, SESSION_STATE } from '../constants/apiErrors';
import { AUTH_TOKEN_STORAGE_KEY } from '../constants/auth';

// `?? {}`: import.meta.env hanya ada di Vite; fallback agar modul bisa diuji di Node (tests/unit)
const ENV = import.meta.env ?? {};
const USE_MOCK = ENV.VITE_USE_MOCK === 'true';
const API_BASE = ENV.VITE_API_URL ?? 'http://localhost:4000/api';

const readToken = () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

function authError(message) {
  const error = new Error(message);
  error.status = 401;
  return error;
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
 * Keadaan sesi untuk token yang ditolak; sesi hanya dihapus (dan notifikasi hanya dipicu) bila token itu masih
 * token aktif. Request lain yang menerima 401 untuk token yang sama setelahnya melihat CLEARED → tidak dobel.
 */
function settleInvalidSession(sentToken) {
  const state = classifySessionState(sentToken, readToken());
  if (state === SESSION_STATE.ACTIVE) clearExpiredSession();
  return state;
}

/**
 * Respons 401 SESSION_INVALID untuk `token` → hasil akhir { res, json } atau lempar error.
 * Maksimal SATU request ulang per panggilan apiClient. Mengulang aman dari efek ganda karena 401 SESSION_INVALID
 * dikirim middleware auth SEBELUM handler route berjalan (tidak ada data yang sempat ditulis server).
 * - Sesi ini kedaluwarsa / sudah dihapus request lain: endpoint tamu → ulang tanpa token; lainnya → pesan ramah.
 * - Pengguna sudah masuk lagi (token baru): GET & endpoint tamu → ulang sekali dengan token baru; POST/PUT/PATCH/
 *   DELETE khusus akun → tidak diulang, error "sesi berubah" tanpa menghapus sesi baru.
 */
async function handleInvalidSession(path, { method, body, token, allowGuest }) {
  const state = settleInvalidSession(token);

  if (state !== SESSION_STATE.REPLACED) {
    if (!allowGuest) throw authError(SESSION_EXPIRED_MESSAGE);
    return send(path, { method, body, token: null });
  }

  if (!allowGuest && method.toUpperCase() !== 'GET') throw authError(SESSION_CHANGED_MESSAGE);

  const retryToken = readToken();
  const retried = await send(path, { method, body, token: retryToken });

  // Ulangan juga ditolak: diproses sekali tanpa ulang lagi; sesi dihapus hanya bila token ulangan masih aktif
  if (isSessionInvalidResponse(retried.res.status, retried.json, retryToken)) {
    const retryState = settleInvalidSession(retryToken);
    throw authError(retryState === SESSION_STATE.REPLACED ? SESSION_CHANGED_MESSAGE : SESSION_EXPIRED_MESSAGE);
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
  // Token yang dipakai request INI dicatat, agar respons 401 yang terlambat tidak menghapus sesi yang lebih baru
  const token = readToken();
  let { res, json } = await send(path, { method, body, token });

  if (isSessionInvalidResponse(res.status, json, token)) {
    ({ res, json } = await handleInvalidSession(path, { method, body, token, allowGuest }));
  }

  if (!res.ok) {
    const error = new Error(json.message ?? `HTTP ${res.status}`);
    // Kode HTTP & kode aplikasi (constants/apiErrors) disertakan agar service bisa membedakan
    // "tidak ditemukan" (404 / 400 INVALID_ID) dari gangguan lain
    error.status = res.status;
    if (typeof json.code === 'string') error.code = json.code;
    throw error;
  }
  return json.data ?? json;
}

export { USE_MOCK };
