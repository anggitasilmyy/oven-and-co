// services/sessionSync.js
// Step 6.3 · FR-04 · FR-26 · BR-04 — sinkronisasi sesi antar-tab.
// Sesi kanonis = nilai persist Zustand di localStorage[AUTH_PERSIST_KEY] (dibagi semua tab). Store Zustand tiap tab
// hanya salinan di memori, jadi:
//   - event `storage` dari tab lain (login, logout, ganti pengguna) → store tab ini dihidrasi ulang;
//   - apiClient memanggil syncSessionFromStorage() sebelum & sesudah request agar event yang belum sempat diproses
//     tidak membuat request memakai identitas yang salah.
// Hidrasi ulang (persist.rehydrate) tidak menulis balik ke storage → tidak ada loop tulis ↔ event.

import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { getSessionUserId } from '../utils/apiErrors';
import { AUTH_PERSIST_KEY } from '../constants/auth';
import { ROLES } from '../constants/roles';

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

/** Keranjang aktif mengikuti identitas: pelanggan → keranjang akunnya, selain itu → keranjang tamu (tidak dihapus) */
function syncCartToUser(user) {
  const cart = useCartStore.getState();
  const customerId = user?.role === ROLES.CUSTOMER ? getSessionUserId(user) : null;
  if (customerId) cart.loadUserCart(customerId);
  else cart.resetToGuest();
}

/**
 * Samakan store tab ini dengan sesi kanonis. Hanya bertindak bila token berbeda.
 * @returns {{changed: boolean, previousToken: string|null}}
 */
export function syncSessionFromStorage() {
  const before = useAuthStore.getState();
  const canonical = readCanonicalSession();
  if (canonical.token === before.token) return { changed: false, previousToken: before.token };

  if (canonical.token) {
    // Isi kanonis valid → hidrasi ulang (sinkron untuk localStorage, tidak menulis balik)
    useAuthStore.persist.rehydrate();
  } else {
    // Kunci dihapus/kosong (logout, localStorage.clear di tab lain) → keluarkan tab ini juga, tanpa notifikasi
    // kedaluwarsa (bukan sesi tab ini yang ditolak server)
    useAuthStore.getState().logout();
  }

  syncCartToUser(useAuthStore.getState().user);
  return { changed: true, previousToken: before.token };
}

/**
 * Pasang pendengar event `storage` (hanya browser). Event hanya datang dari tab LAIN.
 * @returns {() => void} pelepas pendengar
 */
export function startSessionSync(target = typeof window === 'undefined' ? null : window) {
  if (!target?.addEventListener) return () => {};

  const onStorage = (event) => {
    // key null = localStorage.clear() di tab lain
    if (event.key === AUTH_PERSIST_KEY || event.key === null) syncSessionFromStorage();
  };

  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}
