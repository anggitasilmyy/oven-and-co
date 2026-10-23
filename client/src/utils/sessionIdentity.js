// utils/sessionIdentity.js
// Step 6.3 · FR-04 · FR-26 — identitas pengguna sesi (fungsi murni). SATU tempat untuk membaca id pengguna dari
// objek user di useAuthStore, karena bentuknya berbeda per mode:
//   - mode mock : `user_id` (angka)
//   - REST API  : `userId` (string, server auth.service publicUser)

import { ROLES } from '../constants/roles';

const INVALID_ID_TEXT = new Set(['', 'undefined', 'null', 'NaN']);

/** Id dianggap sah bila bukan kosong / undefined / null / "undefined" / NaN */
export function isValidUserId(id) {
  if (id === undefined || id === null) return false;
  if (typeof id === 'number') return Number.isFinite(id);
  return typeof id === 'string' && !INVALID_ID_TEXT.has(id.trim());
}

/** Id pengguna sesi sebagai string; null bila tidak ada / tidak sah */
export function getSessionUserId(user) {
  const id = user?.user_id ?? user?.userId;
  return isValidUserId(id) ? String(id) : null;
}

/**
 * Pemilik keranjang akun: hanya pelanggan dengan id sah. Staf/owner, tamu, atau user tanpa id → null
 * (memakai keranjang tamu). Keranjang akun TIDAK PERNAH memakai id kosong/"undefined".
 */
export function getCartOwnerId(user) {
  return user?.role === ROLES.CUSTOMER ? getSessionUserId(user) : null;
}

/** Kunci pohon halaman untuk pengunjung yang belum login (App.jsx) */
export const GUEST_SESSION_KEY = 'tamu';

/**
 * Kunci pemasangan ulang seluruh halaman (App.jsx): berubah hanya bila IDENTITAS berubah (login, logout, pengguna
 * lain). Token baru untuk pengguna yang sama → kunci sama → halaman tidak dipasang ulang.
 */
export function getSessionTreeKey(user) {
  return getSessionUserId(user) ?? GUEST_SESSION_KEY;
}
