// hooks/useLogout.js
// FR-26 · BR-04 — keluar dari halaman yang dilindungi ProtectedRoute tanpa "terpental" ke /masuk.
//
// Masalah: React Router menjalankan navigasi sebagai transition, sedangkan logout (Zustand)
// sinkron. Bila logout lalu navigate dipanggil berurutan, ProtectedRoute di halaman saat ini
// render dengan user = null dan redirect-nya ke /masuk menimpa navigasi tujuan.
// Solusi: hapus sesi dengan flushSync (render + redirect guard selesai saat itu juga),
// lalu navigasi ke tujuan sehingga tujuan yang terakhir berlaku. Store hanya dipanggil lewat
// aksi yang sudah ada (logout, resetToGuest).

import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';

/** @returns {(to: string) => void} fungsi keluar lalu pindah ke `to` */
export default function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const resetToGuest = useCartStore((s) => s.resetToGuest);

  return (to) => {
    flushSync(() => {
      logout();
      resetToGuest();
    });
    navigate(to, { replace: true });
  };
}
