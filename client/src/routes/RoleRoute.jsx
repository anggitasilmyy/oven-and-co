// routes/RoleRoute.jsx
// Step 3 · Authentication
// FR-26 · Staf tidak bisa membuka menu khusus Owner
// Step 6.6 (CP2a): keputusan dari utils/routeAccess (sama dengan ProtectedRoute & validasi return path).

import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { ACCESS_AREA, resolveAccessRedirect } from '../utils/routeAccess';

/**
 * Batasi halaman admin berdasarkan peran. Belum login → /admin/login (dengan return path);
 * peran tidak sesuai → halaman awal peran yang dimiliki.
 *
 * Penggunaan:
 *   <RoleRoute roles={ADMIN_PAGE_ROLES[ADMIN_ROUTES.DASHBOARD]}>
 *     <DashboardPage />
 *   </RoleRoute>
 *
 * @param {string[]} roles — peran yang diizinkan
 * @param {React.ReactNode} children
 */
export default function RoleRoute({ roles, children }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const redirect = resolveAccessRedirect({ user, roles, area: ACCESS_AREA.ADMIN, location });

  if (redirect) return <Navigate to={redirect.to} state={redirect.state} replace />;
  return children;
}
