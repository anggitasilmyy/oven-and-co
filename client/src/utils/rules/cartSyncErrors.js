// utils/rules/cartSyncErrors.js
// Step 6.6 (CP3) — klasifikasi hasil PUT /api/cart/items & POST /api/cart/merge (fungsi murni). Konservatif, berdasarkan
// pemeriksaan server: semua 4xx dari server kita terjadi SEBELUM commit (express.json, auth/requireRole, validator, throw di
// callback transaksi), sedangkan 500 bisa terjadi sebelum ATAU sesudah COMMIT (P2028/P1017 saat commit) dan status 0 bisa
// berarti respons hilang setelah commit. Attempt tidak boleh dihapus selama status commit tidak pasti.

import { CLIENT_ERROR_CODE, CLIENT_REQUEST_ERROR_CODE } from '../../constants/apiErrors';

export const SYNC_OUTCOME = {
  /** Hasil server diketahui */
  SUCCESS: 'success',
  /** Pasti tidak di-commit (4xx dari server kita) */
  FAILED: 'failed',
  /** Pasti tidak diproses karena sesi (401 sebelum route) */
  SESSION: 'session',
  /** Mungkin sudah di-commit — jangan kirim ulang tanpa pemeriksaan GET */
  UNKNOWN: 'unknown',
};

/** 4xx yang dipastikan berasal dari server kita sebelum commit */
const CERTAIN_CLIENT_ERRORS = new Set([400, 403, 404, 413]);

/** Body error server kita selalu punya `message`; apiClient memakai "HTTP <status>" bila body tidak membawanya */
const hasServerErrorBody = (error) => typeof error?.message === 'string' && !/^HTTP \d{3}$/.test(error.message);

/**
 * @param {Error & {status?: number, code?: string}} error — error dari apiClient
 * @returns {string} SYNC_OUTCOME
 */
export function classifySyncError(error) {
  if (error?.name === 'AbortError') return SYNC_OUTCOME.UNKNOWN;
  // 401 SESSION_INVALID untuk token request ini → ditolak middleware auth sebelum route
  if (error?.code === CLIENT_ERROR_CODE.SESSION_EXPIRED) return SYNC_OUTCOME.SESSION;
  // Sesi berganti: bisa ditolak sebelum dikirim atau respons gagal milik akun lain → tidak pasti
  if (error?.code === CLIENT_ERROR_CODE.SESSION_CHANGED) return SYNC_OUTCOME.UNKNOWN;
  if (error?.code === CLIENT_REQUEST_ERROR_CODE.NETWORK_ERROR) return SYNC_OUTCOME.UNKNOWN;
  if (error?.code === CLIENT_REQUEST_ERROR_CODE.INVALID_RESPONSE) return SYNC_OUTCOME.UNKNOWN;
  if (error?.status === 401 && hasServerErrorBody(error)) return SYNC_OUTCOME.SESSION;
  if (CERTAIN_CLIENT_ERRORS.has(error?.status) && hasServerErrorBody(error)) return SYNC_OUTCOME.FAILED;
  // 5xx, 408/429/499, 4xx tanpa body server kita (gateway), error lain → tidak pasti
  return SYNC_OUTCOME.UNKNOWN;
}
