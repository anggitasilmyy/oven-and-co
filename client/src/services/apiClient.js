// services/apiClient.js
// Step 3 · Authentication
// Memilih antara mock handler atau fetch REST API berdasarkan VITE_USE_MOCK
// Step 6.3: body FormData (unggah foto) & sesi kedaluwarsa (401 SESSION_INVALID → sesi lokal dihapus;
// endpoint yang boleh dipakai tamu dicoba ulang sekali tanpa token).

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { isSessionInvalidResponse } from '../utils/apiErrors';
import { resolveUploadUrl } from '../utils/uploadUrl';
import { SESSION_EXPIRED_MESSAGE } from '../constants/apiErrors';

// `?? {}`: import.meta.env hanya ada di Vite; fallback agar modul bisa diuji di Node (tests/unit)
const ENV = import.meta.env ?? {};
const USE_MOCK = ENV.VITE_USE_MOCK === 'true';
const API_BASE = ENV.VITE_API_URL ?? 'http://localhost:4000/api';

/**
 * Hapus sesi yang sudah tidak berlaku, kembali ke keranjang tamu (keranjang akun tetap tersimpan di perangkat),
 * dan tandai sessionExpired agar pengguna mendapat notifikasi (SessionExpiredNotice di App.jsx).
 */
function clearExpiredSession() {
  useAuthStore.getState().expireSession();
  useCartStore.getState().resetToGuest();
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
  const token = localStorage.getItem('ovenco_auth_token');
  let { res, json } = await send(path, { method, body, token });

  if (isSessionInvalidResponse(res.status, json, token)) {
    clearExpiredSession();
    if (allowGuest) {
      // Maksimal SATU kali ulang, tanpa token; hasilnya diproses biasa (tidak ada pengulangan lagi)
      ({ res, json } = await send(path, { method, body, token: null }));
    } else {
      const error = new Error(SESSION_EXPIRED_MESSAGE);
      error.status = 401;
      throw error;
    }
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
