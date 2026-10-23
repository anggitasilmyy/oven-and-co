// App.jsx
// Step 2 · Layout & Komponen Dasar
// App hanya menjadi titik masuk routing — konten design system ada di /dev/design
// Step 2.5 (PR B): pulihkan keranjang pelanggan saat aplikasi dimuat (FR-04)

import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import useRestoreUserCart from './hooks/useRestoreUserCart';
import SessionExpiredNotice from './components/layout/SessionExpiredNotice';

export default function App() {
  useRestoreUserCart();

  return (
    <BrowserRouter>
      <AppRoutes />
      {/* Step 6.3: beri tahu pengguna bila sesi dihapus otomatis (token kedaluwarsa) */}
      <SessionExpiredNotice />
    </BrowserRouter>
  );
}
