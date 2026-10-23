// services/apiClient.js
// Step 3 · Authentication
// Memilih antara mock handler atau fetch REST API berdasarkan VITE_USE_MOCK
// Step 6.3: body FormData (unggah foto). Token request HANYA dari useAuthStore (satu sumber); identitas request
// dijaga services/sessionRecovery.js (sinkron antar-tab, 401 kedaluwarsa, respons dari identitas lama dibuang).

import { prepareRequestSession, settleResponse, runMockRequest, sessionError } from './sessionRecovery';
import { createApiError } from '../utils/apiErrors';
import { CLIENT_ERROR_CODE } from '../constants/apiErrors';
import { resolveUploadUrl } from '../utils/uploadUrl';

// `?? {}`: import.meta.env hanya ada di Vite; fallback agar modul bisa diuji di Node (tests/unit)
const ENV = import.meta.env ?? {};
const USE_MOCK = ENV.VITE_USE_MOCK === 'true';
const API_BASE = ENV.VITE_API_URL ?? 'http://localhost:4000/api';
const MOCK_LATENCY_MS = 200;

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
 * - API mode   : melakukan fetch ke REST API dengan JWT dari useAuthStore.
 *
 * @param {string} path          - Path relatif, e.g. '/auth/login'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {object|FormData} [options.body]
 * @param {Function} [options.mockHandler] - fungsi async mock(body, { sessionUser }) → data
 * @param {boolean} [options.guestFallback] - kebijakan eksplisit per operasi: bila sesi request ini kedaluwarsa,
 *   kirim ulang SEKALI tanpa token. Hanya untuk endpoint tamu yang body-nya tetap aman sebagai request tamu.
 * @param {(data: any, ownerUser: object|null) => void} [options.reconcileOwner] - Review c53a11c (M1): mutasi SUDAH
 *   berhasil di server untuk `ownerUser`, tetapi akun aktif kini berbeda / sudah keluar. Dipanggil untuk merapikan
 *   state milik pemilik asli (mis. keranjangnya) TANPA menyentuh state akun aktif; lalu apiClient melempar
 *   CLIENT_SESSION_CHANGED_COMMITTED sehingga hasilnya tidak ditampilkan ke akun aktif.
 * @returns {Promise<any>}       - data response (sudah di-unwrap)
 * @throws {Error}               - pesan error dari server / mock; error sesi ber-kode CLIENT_ERROR_CODE
 */
export async function apiClient(
  path, { method = 'GET', body, mockHandler, guestFallback = false, reconcileOwner } = {},
) {
  if (USE_MOCK) {
    if (!mockHandler) {
      throw new Error(`[Mock] Tidak ada handler untuk ${method} ${path}`);
    }
    // Simulasikan latensi jaringan ringan agar UI terasa realistis; identitas dijaga selama jeda (Step 6.3)
    // Handler menerima { sessionUser } = pengguna saat request dimulai (handler lama boleh mengabaikannya)
    return runMockRequest((session) => mockHandler(body, session), MOCK_LATENCY_MS, method);
  }

  // ── Mode API ───────────────────────────────────────────────────────────────
  // Sesi tab ini disamakan dulu dengan sesi kanonis; request dengan identitas yang berubah tidak dikirim, request tamu
  // tetap tamu. Snapshot token & identitas dipakai untuk memeriksa respons.
  const snapshot = prepareRequestSession(method);
  const first = await send(path, { method, body, token: snapshot.token });

  const { res, json, committedFor } = await settleResponse(first, snapshot, {
    method,
    guestFallback,
    resend: (token) => send(path, { method, body, token }),
  });

  if (committedFor !== undefined) {
    try {
      reconcileOwner?.(json.data ?? json, committedFor);
    } catch {
      // Rekonsiliasi lokal gagal (mis. penyimpanan penuh) tidak mengubah fakta bahwa transaksi sudah tersimpan
    }
    throw sessionError(CLIENT_ERROR_CODE.SESSION_CHANGED_COMMITTED);
  }

  if (!res.ok) {
    // Kode HTTP & kode aplikasi (constants/apiErrors) disertakan agar service bisa membedakan
    // "tidak ditemukan" (404 / 400 INVALID_ID) dari gangguan lain
    throw createApiError(json.message ?? `HTTP ${res.status}`, res.status, json.code);
  }
  return json.data ?? json;
}

export { USE_MOCK };
