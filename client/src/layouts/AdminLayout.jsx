// layouts/AdminLayout.jsx
// Step 2 · Layout & Komponen Dasar
// FR-26 – FR-36 · AD-01 – AD-11 · Desktop 1440px, sidebar kiri 9 menu

import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { ADMIN_ROUTES } from '../constants/routes';

/**
 * 9 menu sidebar sesuai SPEC §7.
 * Catatan peran dipakai di Step 3 (RoleRoute); sekarang semua visible.
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
  const navigate = useNavigate();
  // State untuk mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex">

      {/* ── Sidebar Kiri ──────────────────────────────────────────────────── */}
      {/* Desktop: always visible; Mobile: drawer */}
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
            'lg:relative lg:translate-x-0 lg:z-auto lg:flex',
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
              className="ml-auto lg:hidden w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
              aria-label="Tutup sidebar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Menu navigasi */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Menu admin">
            {SIDEBAR_MENU.map(({ label, to, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors duration-150 ` +
                  (isActive
                    ? 'bg-primary/80 text-cream'
                    : 'text-cream/60 hover:bg-white/8 hover:text-cream')
                }
                aria-label={label}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer sidebar */}
          <div className="px-5 py-4 border-t border-white/10">
            <p className="text-xs text-cream/30 font-sans">© 2026 Oven &amp; Co.</p>
          </div>
        </aside>
      </>

      {/* ── Area Konten Kanan ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-surface border-b border-beige h-14 flex items-center px-6 gap-4">
          {/* Tombol hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-beige transition-colors"
            aria-label="Buka menu"
          >
            <Menu size={20} className="text-cocoa" />
          </button>

          <div className="flex-1" />

          {/* Info user — diisi di Step 3 */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-cocoa leading-tight">Admin</p>
              <p className="text-xs text-cocoa/50">Owner</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
              <ChefHat size={18} className="text-primary" />
            </div>
          </div>
        </header>

        {/* Konten halaman admin */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
