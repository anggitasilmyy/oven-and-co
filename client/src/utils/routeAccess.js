// utils/routeAccess.js
// FR-26 · BR-04 · SPEC §2 & §7 — aturan akses rute per peran (fungsi murni, dipakai ProtectedRoute, RoleRoute,
// MasukPage, AdminLoginPage). Step 6.6 (CP2a):
//   - pengunjung / sesi berakhir di area admin → /admin/login (AD-01); di area pelanggan → /masuk (C-02);
//   - halaman khusus pelanggan (checkout, pesanan, akun, notifikasi) hanya untuk peran customer — Staf & Owner
//     dialihkan ke halaman awal perannya SEBELUM halaman memanggil API (proteksi server tetap berlaku);
//   - return path setelah login hanya path internal yang boleh dibuka peran tersebut (tanpa open redirect).

import { ROLES, ROLE_LANDING } from '../constants/roles';
import { ADMIN_ROUTES, CUSTOMER_ROUTES } from '../constants/routes';

/** Area aplikasi yang menentukan halaman login */
export const ACCESS_AREA = { CUSTOMER: 'customer', ADMIN: 'admin' };

const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];
const OWNER_ONLY = [ROLES.OWNER];

/** Peran per halaman admin (SPEC §7) — satu sumber untuk AppRoutes & validasi return path */
export const ADMIN_PAGE_ROLES = {
  [ADMIN_ROUTES.DASHBOARD]: OWNER_ONLY,
  [ADMIN_ROUTES.PESANAN]: ADMIN_ROLES,
  [ADMIN_ROUTES.KALENDER]: ADMIN_ROLES,
  [ADMIN_ROUTES.PRODUK]: ADMIN_ROLES,
  [ADMIN_ROUTES.STOK]: ADMIN_ROLES,
  [ADMIN_ROUTES.PEMBELIAN]: ADMIN_ROLES, // CR-04a · AD-12 (K01: Staf & Owner)
  [ADMIN_ROUTES.PELANGGAN]: ADMIN_ROLES,
  [ADMIN_ROUTES.LAPORAN]: OWNER_ONLY,
  [ADMIN_ROUTES.PROMO]: OWNER_ONLY,
  [ADMIN_ROUTES.PENGATURAN]: OWNER_ONLY,
};

/** Peran yang boleh membuka area tertentu (layout admin = Staf & Owner; halaman pelanggan login = customer) */
export const AREA_ROLES = {
  [ACCESS_AREA.CUSTOMER]: [ROLES.CUSTOMER],
  [ACCESS_AREA.ADMIN]: ADMIN_ROLES,
};

/** Halaman pelanggan yang wajib login & khusus peran customer (SPEC §7 kolom "Login? Ya") */
const CUSTOMER_ONLY_PREFIXES = [
  CUSTOMER_ROUTES.CHECKOUT, // termasuk /checkout/pembayaran
  '/bayar',
  '/pesanan-berhasil',
  CUSTOMER_ROUTES.RIWAYAT_PESANAN, // termasuk detail & form ulasan
  CUSTOMER_ROUTES.AKUN, // termasuk sub-akun
  CUSTOMER_ROUTES.NOTIFIKASI,
];

/** Halaman login/daftar/onboarding bukan tujuan kembali (mencegah putaran login) */
const NOT_A_RETURN_TARGET = [
  CUSTOMER_ROUTES.ONBOARDING, CUSTOMER_ROUTES.MASUK, CUSTOMER_ROUTES.DAFTAR, CUSTOMER_ROUTES.LUPA_SANDI, ADMIN_ROUTES.LOGIN,
];

const ADMIN_PREFIX = '/admin';
const RETURN_PATH_MAX_LENGTH = 2048;
const INTERNAL_ORIGIN = 'http://ovenco.internal';

const matchesPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Area halaman berdasarkan path */
export function areaOf(pathname) {
  return matchesPrefix(pathname, ADMIN_PREFIX) ? ACCESS_AREA.ADMIN : ACCESS_AREA.CUSTOMER;
}

/** Halaman login untuk area tertentu */
export function loginRouteFor(area) {
  return area === ACCESS_AREA.ADMIN ? ADMIN_ROUTES.LOGIN : CUSTOMER_ROUTES.MASUK;
}

/** Halaman awal peran (tidak dikenal → Beranda) */
export function landingFor(role) {
  return ROLE_LANDING[role] ?? CUSTOMER_ROUTES.BERANDA;
}

/** Peran yang diizinkan membuka `pathname`; null = halaman publik (semua orang) */
export function rolesForPath(pathname) {
  if (matchesPrefix(pathname, ADMIN_PREFIX)) {
    const page = Object.keys(ADMIN_PAGE_ROLES).find((p) => matchesPrefix(pathname, p));
    // Path admin yang tidak terdaftar (mis. /admin/xyz) tidak pernah diizinkan sebagai tujuan
    return page ? ADMIN_PAGE_ROLES[page] : [];
  }
  if (CUSTOMER_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) return AREA_ROLES[ACCESS_AREA.CUSTOMER];
  return null;
}

/** true bila peran `role` boleh membuka `pathname` (halaman login tidak pernah dianggap tujuan) */
export function isPathAllowedForRole(pathname, role) {
  if (NOT_A_RETURN_TARGET.some((p) => matchesPrefix(pathname, p))) return false;
  const roles = rolesForPath(pathname);
  return roles === null || roles.includes(role);
}

/**
 * Return path aman setelah login, atau null.
 * Hanya path relatif internal ("/..."); URL absolut, protokol-relatif ("//host"), backslash, karakter kontrol, atau
 * path yang tidak boleh dibuka peran tersebut ditolak. Path dinormalisasi (mis. "/a/../admin") sebelum diperiksa.
 * @param {unknown} returnTo — dari location.state (diisi guard rute)
 * @param {string} role
 * @returns {string|null}
 */
export function sanitizeReturnTo(returnTo, role) {
  if (typeof returnTo !== 'string' || returnTo.length === 0 || returnTo.length > RETURN_PATH_MAX_LENGTH) return null;
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(returnTo)) return null;
  let url;
  try {
    url = new URL(returnTo, INTERNAL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_ORIGIN) return null;
  if (!isPathAllowedForRole(url.pathname, role)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Tujuan setelah login: return path aman bila ada, selain itu halaman awal peran */
export function postLoginTarget(user, returnTo) {
  return sanitizeReturnTo(returnTo, user?.role) ?? landingFor(user?.role);
}

/**
 * Keputusan guard rute.
 * @param {{user: object|null, roles: string[], area: string, location: {pathname: string, search?: string, hash?: string}}} p
 * @returns {null | {to: string, state?: {returnTo: string}}} null = boleh dibuka
 */
export function resolveAccessRedirect({ user, roles, area, location }) {
  if (!user) {
    const returnTo = `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
    return { to: loginRouteFor(area), state: { returnTo } };
  }
  if (!roles.includes(user.role)) return { to: landingFor(user.role) };
  return null;
}
