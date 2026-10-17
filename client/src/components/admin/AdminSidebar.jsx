// components/admin/AdminSidebar.jsx
// FR-26 – FR-36 · AD-02 – AD-11 — sidebar 9 menu admin, difilter per peran
// ≥ lg : sidebar tetap (sticky) · < lg : drawer dengan backdrop (dibuka dari AdminTopbar)
// Dipisah dari layouts/AdminLayout.jsx di Step 2.5 (PR B) tanpa mengubah perilaku.

import { NavLink } from 'react-router-dom';
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
  X,
  ChefHat,
  LogOut,
} from 'lucide-react';
import { ADMIN_ROUTES } from '../../constants/routes';
import { ROLE_LABEL } from '../../constants/roles';
import AdminAvatar from './AdminAvatar';

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

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60';

/**
 * @param {object|null} user — pengguna login (role menentukan menu)
 * @param {boolean} isOpen — drawer terbuka (< lg)
 * @param {Function} onClose — tutup drawer
 * @param {Function} onLogout — aksi Keluar
 */
export default function AdminSidebar({ user, isOpen, onClose, onLogout }) {
  /** Filter menu berdasarkan peran pengguna yang sedang login */
  const visibleMenu = user ? SIDEBAR_MENU.filter((m) => m.roles.includes(user.role)) : [];

  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={[
          'fixed top-0 left-0 h-full z-50 flex flex-col print:!hidden',
          'w-64 bg-cocoa text-cream',
          'transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
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
            onClick={onClose}
            className={`ml-auto lg:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-lg
                        hover:bg-white/10 active:bg-white/20 ${FOCUS_RING}`}
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
                `active:bg-white/20 ${FOCUS_RING} ` +
                (isActive ? 'bg-primary/80 text-cream' : 'text-cream/70 hover:bg-white/10 hover:text-cream')
              }
              aria-label={label}
              onClick={onClose}
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
              <AdminAvatar name={user.name} variant="dark" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-cream truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-cream/50 capitalize">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
          )}
          <button
            id="admin-logout-btn"
            onClick={onLogout}
            className={`w-full flex items-center gap-2 text-cream/70 hover:text-cream text-xs font-medium
                        px-2 min-h-touch-min rounded hover:bg-white/10 active:bg-white/20 transition-colors ${FOCUS_RING}`}
            aria-label="Keluar dari panel admin"
          >
            <LogOut size={14} />
            Keluar
          </button>
        </div>
      </aside>
    </>
  );
}
