// App.jsx
// Step 2 · Layout & Komponen Dasar
// App hanya menjadi titik masuk routing — konten design system ada di /dev/design
// Step 2.5 (PR B): pulihkan keranjang pelanggan saat aplikasi dimuat (FR-04)

import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import useRestoreUserCart from './hooks/useRestoreUserCart';

export default function App() {
  useRestoreUserCart();

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
