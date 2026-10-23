// services/sessionSync.js
// Step 6.3 · FR-04 · FR-26 · BR-04 — sinkronisasi sesi antar-tab.
// Sesi kanonis = nilai persist Zustand di localStorage[AUTH_PERSIST_KEY] (dibagi semua tab). Store Zustand tiap tab
// hanya salinan di memori, jadi tab ini disamakan dengan sesi kanonis:
//   - event `storage` dari tab lain (login, logout, ganti pengguna, ubah profil);
//   - `pageshow` (halaman dipulihkan dari back/forward cache, yang melewatkan event storage) & `visibilitychange`;
//   - sebelum & sesudah setiap request (services/sessionRecovery) agar event yang belum diproses tidak dipakai.
// Hidrasi ulang (persist.rehydrate) tidak menulis balik ke storage → tidak ada loop tulis ↔ event.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { getCartOwnerId, describeSessionChange } from '../utils/sessionIdentity';
import { AUTH_PERSIST_KEY } from '../constants/auth';

/** Sesi kanonis tersimpan → { token, user }; kunci tidak ada / rusak → sesi kosong */
export function readCanonicalSession() {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(AUTH_PERSIST_KEY);
    const state = raw ? JSON.parse(raw)?.state : null;
    return { token: state?.token ?? null, user: state?.user ?? null };
  } catch {
    return { token: null, user: null };
  }
}

const sameUser = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const NO_CHANGE = Object.freeze({
  changed: false, tokenChanged: false, identityChanged: false, sessionChanged: false, profileChanged: false,
});

/**
 * Samakan store tab ini dengan sesi kanonis (token ATAU data user berbeda).
 * @returns {{changed, tokenChanged, identityChanged, sessionChanged, profileChanged}}
 *   changed — ada yang disalin dari sesi kanonis (termasuk perubahan profil saja: nama, email, …);
 *   field lain: lihat describeSessionChange. Perubahan profil saja BUKAN pergantian sesi (temuan M1) dan tidak boleh
 *   membatalkan request.
 */
export function syncSessionFromStorage() {
  const before = useAuthStore.getState();
  const canonical = readCanonicalSession();
  if (canonical.token === before.token && sameUser(canonical.user, before.user)) return { ...NO_CHANGE };

  if (canonical.token) {
    // Hidrasi ulang (sinkron untuk localStorage, tidak menulis balik). Bila hidrasi tidak menerapkan nilai kanonis
    // (mis. versi persist berbeda tanpa migrate), nilai kanonis diterapkan langsung agar tab tetap konvergen.
    useAuthStore.persist.rehydrate();
    const hydrated = useAuthStore.getState();
    if (hydrated.token !== canonical.token || !sameUser(hydrated.user, canonical.user)) {
      useAuthStore.setState({ token: canonical.token, user: canonical.user });
    }
    // Sesi baru dari tab lain → notifikasi "sesi berakhir" lama tidak relevan lagi
    if (canonical.token !== before.token && useAuthStore.getState().sessionExpired) {
      useAuthStore.getState().dismissSessionNotice();
    }
  } else {
    // Kunci dihapus/kosong (logout, localStorage.clear di tab lain) → keluarkan tab ini juga, tanpa notifikasi
    // kedaluwarsa (bukan sesi tab ini yang ditolak server)
    useAuthStore.getState().logout();
  }

  // Keranjang hanya berpindah bila PEMILIK berubah (ubah nama/email tidak memuat ulang keranjang)
  const after = useAuthStore.getState();
  if (getCartOwnerId(after.user) !== getCartOwnerId(before.user)) {
    useCartStore.getState().loadCartForUser(after.user);
  }
  return { changed: true, ...describeSessionChange(before, after) };
}

/**
 * Pasang pendengar sinkronisasi (hanya browser).
 * @param {{win?: object|null, doc?: object|null}} [targets] — default window & document; null di Node/SSR
 * @returns {() => void} pelepas semua pendengar
 */
export function startSessionSync({
  win = typeof window === 'undefined' ? null : window,
  doc = typeof document === 'undefined' ? null : document,
} = {}) {
  const cleanups = [];

  if (win?.addEventListener) {
    const onStorage = (event) => {
      // key null = localStorage.clear() di tab lain
      if (event.key === AUTH_PERSIST_KEY || event.key === null) syncSessionFromStorage();
    };
    const onPageShow = () => syncSessionFromStorage();
    win.addEventListener('storage', onStorage);
    win.addEventListener('pageshow', onPageShow);
    cleanups.push(() => win.removeEventListener('storage', onStorage));
    cleanups.push(() => win.removeEventListener('pageshow', onPageShow));
  }

  if (doc?.addEventListener) {
    const onVisibility = () => {
      if (doc.visibilityState === 'visible') syncSessionFromStorage();
    };
    doc.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => doc.removeEventListener('visibilitychange', onVisibility));
  }

  return () => cleanups.forEach((cleanup) => cleanup());
}
