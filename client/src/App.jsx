// App.jsx
// Step 2 · Layout & Komponen Dasar
// App hanya menjadi titik masuk routing — konten design system ada di /dev/design
// Step 2.5 (PR B): pulihkan keranjang pelanggan saat aplikasi dimuat (FR-04)

import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import useRestoreUserCart from './hooks/useRestoreUserCart';
import SessionExpiredNotice from './components/layout/SessionExpiredNotice';
import useSessionSync from './hooks/useSessionSync';
import useAuthStore from './stores/useAuthStore';
import { getSessionTreeKey } from './utils/sessionIdentity';

export default function App() {
  useRestoreUserCart();
  // Step 6.3: sesi & keranjang mengikuti login/logout/ganti pengguna di tab lain
  useSessionSync();
  // Step 6.3 (temuan #2/#4): seluruh halaman dipasang ulang saat identitas berganti (login, logout, pengguna lain di
  // tab lain), sehingga data & form milik pengguna sebelumnya hilang dan respons lama tidak lagi memperbarui UI
  // (useServiceQuery mengabaikan hasil setelah unmount). Ganti token untuk pengguna yang sama tidak memasang ulang.
  const sessionKey = useAuthStore((s) => getSessionTreeKey(s.user));

  return (
    <BrowserRouter>
      <AppRoutes key={sessionKey} />
      {/* Step 6.3: beri tahu pengguna bila sesi dihapus otomatis (token kedaluwarsa) */}
      <SessionExpiredNotice />
    </BrowserRouter>
  );
}
