// layouts/AdminLayout.jsx
// Step 3 · Authentication (update dari Step 2)
// FR-26 – FR-36 · AD-01 – AD-11 · Desktop 1440px, sidebar kiri 9 menu
// Step 3: filter menu per role, info user di topbar, tombol logout
// Step 2.5 (PR A): padding responsif, max-width konten, sidebar sticky ≥ lg, drawer < lg dipertahankan

import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  ShoppingBag,
  Boxes,
  BarChart2,
  Tag,
  Users,
  Settings,
  Menu,
  X,
  ChefHat,
  LogOut,
} from 'lucide-react';
import { ADMIN_ROUTES } from '../constants/routes';
import { ROLE_LABEL } from '../constants/roles';
import useAuthStore from '../stores/useAuthStore';
import useLogout from '../hooks/useLogout';

/**
 * 9 menu sidebar sesuai SPEC §7.
 * Field `roles` menentukan siapa yang bisa melihat menu tersebut.
 */
const SIDEBAR_MENU = [
  { label: 'Dashboard', to: ADMIN_ROUTES.DASHBOARD, Icon: LayoutDashboard, roles: ['owner'] },
  { label: 'Pesanan', to: ADMIN_ROUTES.PESANAN, Icon: ClipboardList, roles: ['owner', 'staf'] },
  { label: 'Kalender Produksi', to: ADMIN_ROUTES.KALENDER, Icon: CalendarDays, roles: ['owner', 'staf'] },
  { label: 'Produk & Custom Cake', to: ADMIN_ROUTES.PRODUK, Icon: ShoppingBag, roles: ['owner', 'staf'] },
  { label: 'Stok', to: ADMIN_ROUTES.STOK, Icon: Boxes, roles: ['owner', 'staf'] },
  { label: 'Laporan', to: ADMIN_ROUTES.LAPORAN, Icon: BarChart2, roles: ['owner'] },
  { label: 'Promo & Loyalty', to: ADMIN_ROUTES.PROMO, Icon: Tag, roles: ['owner'] },
  { label: 'Pelanggan & Ulasan', to: ADMIN_ROUTES.PELANGGAN, Icon: Users, roles: ['owner', 'staf'] },
  { label: 'Pengaturan', to: ADMIN_ROUTES.PENGATURAN, Icon: Settings, roles: ['owner'] },
];

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const logoutAndLeave = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /** Filter menu berdasarkan peran pengguna yang sedang login */
  const visibleMenu = user
    ? SIDEBAR_MENU.filter((m) => m.roles.includes(user.role))
    : [];

  // Keluar → halaman login admin (sesi dihapus setelah layout admin ditinggalkan)
  const handleLogout = () => logoutAndLeave(ADMIN_ROUTES.LOGIN);

  // Inisial nama untuk avatar
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="min-h-screen bg-cream flex">

      {/* ── Sidebar Kiri ──────────────────────────────────────────────────── */}
      <>
        {/* Backdrop mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={[
            'fixed top-0 left-0 h-full z-50 flex flex-col',
            'w-64 bg-cocoa text-cream',
            'transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:z-auto lg:flex',
          ].join(' ')}
          aria-label="Sidebar admin"
        >
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <ChefHat size={18} className="text-cream" />
            </div>
            <div>
              <p className="font-display text-base leading-tight">Oven &amp; Co.</p>
              <p className="text-[10px] text-cream/50 font-sans">Admin Panel</p>
            </div>
            {/* Tombol tutup (mobile) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-lg
                         hover:bg-white/10 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60"
              aria-label="Tutup sidebar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Menu navigasi — difilter per role */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Menu admin">
            {visibleMenu.map(({ label, to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 min-h-touch-min rounded-lg text-sm font-sans font-medium transition-colors duration-150 ` +
                  `active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60 ` +
                  (isActive
                    ? 'bg-primary/80 text-cream'
                    : 'text-cream/70 hover:bg-white/10 hover:text-cream')
                }
                aria-label={label}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer sidebar — info user & logout */}
          <div className="px-4 py-4 border-t border-white/10 space-y-3">
            {user && (
              <div className="flex items-center gap-3">
                {/* Avatar inisial */}
                <div className="w-8 h-8 rounded-full bg-primary/60 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-cream">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-cream truncate leading-tight">{user.name}</p>
                  <p className="text-[11px] text-cream/50 capitalize">{ROLE_LABEL[user.role]}</p>
                </div>
              </div>
            )}
            <button
              id="admin-logout-btn"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 text-cream/70 hover:text-cream text-xs font-medium
                         px-2 min-h-touch-min rounded hover:bg-white/10 active:bg-white/20 transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60"
              aria-label="Keluar dari panel admin"
            >
              <LogOut size={14} />
              Keluar
            </button>
          </div>
        </aside>
      </>

      {/* ── Area Konten Kanan ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-surface border-b border-beige h-14 lg:h-16 flex items-center px-4 md:px-6 lg:px-8 gap-4">
          {/* Hamburger mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-beige active:bg-beige/70
                       transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-expanded={sidebarOpen}
            aria-label="Buka menu"
          >
            <Menu size={20} className="text-cocoa" />
          </button>

          <div className="flex-1" />

          {/* Info user di topbar (desktop) */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-cocoa leading-tight">{user.name}</p>
                <p className="text-xs text-cocoa/50 capitalize">{ROLE_LABEL[user.role]}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{initials}</span>
              </div>
            </div>
          )}
        </header>

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
