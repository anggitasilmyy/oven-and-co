// utils/uploadUrl.js
// Step 6.3 · FR-10 · AD-04 — path unggahan dari server (mis. "/uploads/custom-cakes/<nama>.jpg", disimpan relatif
// di database) menjadi URL yang bisa dimuat browser. File unggahan disajikan server API di /uploads/... (BUKAN di
// bawah /api), jadi yang dipakai hanya ORIGIN dari VITE_API_URL.

const UPLOAD_PATH_PREFIX = '/uploads/';

/**
 * @param {string|null|undefined} path — path relatif server, URL absolut, data URL (mode mock), atau aset frontend
 * @param {string} apiBase — VITE_API_URL, mis. "http://localhost:4000/api" atau "/api" (proxy origin yang sama)
 * @returns {string|null}
 */
export function resolveUploadUrl(path, apiBase) {
  if (!path) return null;
  // data URL (mock), URL absolut, dan aset frontend (/images/...) dipakai apa adanya
  if (!path.startsWith(UPLOAD_PATH_PREFIX)) return path;
  // API di origin lain → origin API + path; API relatif (origin sama, mis. "/api") → path relatif apa adanya
  if (/^https?:\/\//i.test(apiBase ?? '')) {
    try {
      return `${new URL(apiBase).origin}${path}`;
    } catch {
      return path;
    }
  }
  return path;
}
