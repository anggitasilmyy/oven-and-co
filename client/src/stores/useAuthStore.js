// stores/useAuthStore.js
// Step 3 · Authentication
// FR-02 · FR-26 · Zustand store untuk sesi pengguna

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Key persist Zustand.
 * Dipisahkan dari "ovenco_mock_*" karena ini state sesi (bukan data mock),
 * tetap dipakai di mode API juga.
 */
const AUTH_STORAGE_KEY = 'ovenco_auth';

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

      /** Simpan sesi setelah login / register berhasil */
      setAuth: (user, token) => {
        // Simpan token juga di localStorage biasa agar apiClient bisa baca tanpa store
        localStorage.setItem('ovenco_auth_token', token);
        set({ user, token });
      },

      /** Hapus sesi */
      logout: () => {
        localStorage.removeItem('ovenco_auth_token');
        set({ user: null, token: null });
      },

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
      name: AUTH_STORAGE_KEY,
      // Hanya persist user & token; fungsi tidak perlu di-persist
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export default useAuthStore;
