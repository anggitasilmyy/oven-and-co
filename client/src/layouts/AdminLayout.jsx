// layouts/AdminLayout.jsx
// Step 3 · Authentication (update dari Step 2)
// FR-26 – FR-36 · AD-01 – AD-11 · Desktop 1440px, sidebar kiri 9 menu
// Step 3: filter menu per role, info user di topbar, tombol logout
// Step 2.5 (PR A): padding responsif, max-width konten, sidebar sticky ≥ lg, drawer < lg dipertahankan
// Step 2.5 (PR B): sidebar & topbar dipecah ke components/admin/ (AdminSidebar, AdminTopbar)

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ADMIN_ROUTES } from '../constants/routes';
import useAuthStore from '../stores/useAuthStore';
import useLogout from '../hooks/useLogout';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminTopbar from '../components/admin/AdminTopbar';

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const logoutAndLeave = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keluar → halaman login admin (lihat hooks/useLogout.js)
  const handleLogout = () => logoutAndLeave(ADMIN_ROUTES.LOGIN);

  return (
    <div className="min-h-screen bg-cream flex">
      <AdminSidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* ── Area Konten Kanan ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopbar user={user} isSidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen(true)} />

        {/* Konten halaman admin */}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">
          <div className="w-full max-w-content mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
