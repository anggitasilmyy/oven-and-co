// routes/ProtectedRoute.jsx
// Step 3 · Authentication
// BR-04 · Wajib masuk sebelum checkout; redirect balik ke halaman asal setelah login
// Step 6.6 (CP2a): keputusan dari utils/routeAccess — area admin → /admin/login, area pelanggan → /masuk (dengan
// return path); peran yang tidak sesuai area (mis. Staf/Owner di halaman khusus pelanggan) → halaman awal perannya
// sebelum halaman memanggil API. Proteksi server (auth + requireRole) tetap berlaku.

import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { ACCESS_AREA, AREA_ROLES, resolveAccessRedirect } from '../utils/routeAccess';

/**
 * @param {React.ReactNode} children
 * @param {string} [area] — ACCESS_AREA.CUSTOMER (default) atau ACCESS_AREA.ADMIN
 */
export default function ProtectedRoute({ children, area = ACCESS_AREA.CUSTOMER }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const redirect = resolveAccessRedirect({ user, roles: AREA_ROLES[area], area, location });

  if (redirect) return <Navigate to={redirect.to} state={redirect.state} replace />;
  return children;
}
