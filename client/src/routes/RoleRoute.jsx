// routes/RoleRoute.jsx
// Step 3 · Authentication
// FR-26 · Staf tidak bisa membuka menu khusus Owner

import { Navigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { ROLE_LANDING } from '../constants/roles';

/**
 * Batasi akses halaman berdasarkan peran.
 * Jika peran tidak sesuai, redirect ke halaman awal peran yang dimiliki.
 *
 * Penggunaan:
 *   <RoleRoute roles={['owner']}>
 *     <DashboardPage />
 *   </RoleRoute>
 *
 * @param {string[]} roles — peran yang diizinkan
 * @param {React.ReactNode} children
 */
export default function RoleRoute({ roles, children }) {
  const user = useAuthStore((s) => s.user);

  // Jika belum login (seharusnya sudah ditangani ProtectedRoute sebelumnya)
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!roles.includes(user.role)) {
    // Redirect ke landing page sesuai peran yang dimiliki
    const fallback = ROLE_LANDING[user.role] ?? '/';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
