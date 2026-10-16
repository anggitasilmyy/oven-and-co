// components/layout/AccountSidebar.jsx
// Step 2.5 (PR A) · C-20 menu Akun versi sidebar (≥ lg) untuk AccountLayout
// Menu: Ubah Profil, Voucher & Poin, Alamat, Wishlist, Keluar (sama dengan C-20)

import { NavLink } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { ACCOUNT_MENU_ITEMS } from '../../constants/navigation';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import useAuthStore from '../../stores/useAuthStore';
import useLogout from '../../hooks/useLogout';

const itemClass = ({ isActive }) =>
  `flex items-center gap-3 min-h-touch-min px-3 rounded-btn text-sm font-semibold
   transition-colors duration-150 active:scale-[0.98]
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ` +
  (isActive ? 'bg-beige text-primary' : 'text-cocoa/75 hover:bg-beige/60 hover:text-cocoa');

export default function AccountSidebar() {
  const user = useAuthStore((s) => s.user);
  const logoutAndLeave = useLogout();

  // Hapus sesi lalu kembali ke Beranda (keranjang kembali ke keranjang tamu)
  const handleLogout = () => logoutAndLeave(CUSTOMER_ROUTES.BERANDA);

  return (
    <nav aria-label="Menu akun" className="card p-3 space-y-1">
      <NavLink to={CUSTOMER_ROUTES.AKUN} end className={itemClass}>
        <User size={18} aria-hidden="true" />
        <span className="min-w-0 truncate">{user?.name ?? 'Akun'}</span>
      </NavLink>
      <div className="h-px bg-beige my-2" />
      {ACCOUNT_MENU_ITEMS.map(({ label, to, Icon }) => (
        <NavLink key={to} to={to} className={itemClass}>
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
      <div className="h-px bg-beige my-2" />
      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center gap-3 min-h-touch-min px-3 rounded-btn text-sm font-semibold
                   text-error hover:bg-red-50 active:scale-[0.98] transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
      >
        <LogOut size={18} aria-hidden="true" />
        Keluar
      </button>
    </nav>
  );
}
