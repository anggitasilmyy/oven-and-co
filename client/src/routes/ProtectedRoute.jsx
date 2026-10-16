// routes/ProtectedRoute.jsx
// Step 3 · Authentication
// BR-04 · Wajib masuk sebelum checkout; redirect balik ke halaman asal setelah login

import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { CUSTOMER_ROUTES } from '../constants/routes';

/**
 * Lindungi rute yang memerlukan login.
 * Jika belum login, redirect ke /masuk dengan `state.returnTo`
 * agar setelah login pengguna kembali ke halaman yang dituju.
 *
 * @param {React.ReactNode} children
 */
export default function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={CUSTOMER_ROUTES.MASUK}
        state={{ returnTo: location.pathname + location.search }}
        replace
      />
    );
  }

  return children;
}
