// stores/useAuthStore.js
// Step 3 · Authentication
// FR-02 · FR-26 · Zustand store untuk sesi pengguna
// Step 6.3: store ini satu-satunya sumber token request (services/apiClient). Sesi kanonis dipersist di
// AUTH_PERSIST_KEY dan disinkronkan antar-tab oleh services/sessionSync.js.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AUTH_PERSIST_KEY, AUTH_TOKEN_STORAGE_KEY } from '../constants/auth';
import { getSessionUserId } from '../utils/sessionIdentity';

/** Salinan token lama (kompatibilitas, tulis-saja); ditulis SETELAH state kanonis tersimpan */
function writeTokenCopy(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

/**
 * useAuthStore
 *
 * State:
 *   user   — objek pengguna yang sedang login (tanpa password), atau null
 *   token  — JWT / mock token, atau null
 *
 * Actions:
 *   setAuth(user, token) — simpan sesi setelah login / register
 *   logout()             — hapus sesi
 *   isLoggedIn()         — computed boolean
 *   hasRole(role)        — cek peran
 */
const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      /** Simpan sesi setelah login / register berhasil (state kanonis ditulis persist saat set) */
      setAuth: (user, token) => {
        set({ user, token, sessionExpired: false });
        writeTokenCopy(token);
      },

      /**
       * Step 6.3 (temuan #5): perbarui data profil pengguna yang SEDANG login tanpa menyentuh token.
       * Hanya diterapkan bila id pada data baru sama dengan id sesi saat ini — respons terlambat milik pengguna lain
       * (atau setelah logout) diabaikan, dan token lama tidak pernah ditulis kembali di atas sesi yang lebih baru.
       * @returns {boolean} true bila diterapkan
       */
      updateCurrentUser: (updated) => {
        const { user, token } = get();
        const currentId = getSessionUserId(user);
        if (!token || !currentId || getSessionUserId(updated) !== currentId) return false;
        set({ user: updated });
        return true;
      },

      /** Hapus sesi */
      logout: () => {
        set({ user: null, token: null });
        writeTokenCopy(null);
      },

      /**
       * Step 6.3: sesi dihapus otomatis karena server menolak token (401 SESSION_INVALID).
       * Menandai `sessionExpired` agar SessionExpiredNotice memberi tahu pengguna (tidak di-persist).
       */
      sessionExpired: false,
      expireSession: () => {
        set({ user: null, token: null, sessionExpired: true });
        writeTokenCopy(null);
      },
      dismissSessionNotice: () => set({ sessionExpired: false }),

      /** true jika pengguna sudah login */
      isLoggedIn: () => !!get().user,

      /** true jika pengguna memiliki salah satu peran yang diberikan */
      hasRole: (...roles) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },
    }),
    {
      name: AUTH_PERSIST_KEY,
      // Eksplisit (default Zustand = window.localStorage; di browser objeknya sama). Sesi kanonis selalu di sini.
      storage: createJSONStorage(() => localStorage),
      // Hanya persist user & token; fungsi & sessionExpired tidak perlu di-persist
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export default useAuthStore;
