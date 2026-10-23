// services/apiClient.js
// Step 3 · Authentication
// Memilih antara mock handler atau fetch REST API berdasarkan VITE_USE_MOCK

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

/**
 * Klien API universal.
 * - Mock mode  : meneruskan panggilan ke handler mock (fungsi async).
 * - API mode   : melakukan fetch ke REST API dengan JWT dari localStorage.
 *
 * @param {string} path          - Path relatif, e.g. '/auth/login'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {object} [options.body]
 * @param {Function} [options.mockHandler] - fungsi async mock(body) → data
 * @returns {Promise<any>}       - data response (sudah di-unwrap)
 * @throws {Error}               - pesan error dari server / mock
 */
export async function apiClient(path, { method = 'GET', body, mockHandler } = {}) {
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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.message ?? `HTTP ${res.status}`);
    // Kode HTTP disertakan agar service bisa membedakan "tidak ditemukan" (404) dari gangguan lain
    error.status = res.status;
    throw error;
  }
  return json.data ?? json;
}

export { USE_MOCK };
