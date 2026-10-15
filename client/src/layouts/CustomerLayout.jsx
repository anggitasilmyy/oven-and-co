// layouts/CustomerLayout.jsx
// Step 2 · Layout & Komponen Dasar
// FR-05, FR-06, FR-17, FR-19, FR-22, FR-24 — layout utama pelanggan

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Grid2X2, ShoppingBag, User } from 'lucide-react';
import { CUSTOMER_ROUTES } from '../constants/routes';

/** Tab bottom nav sesuai SPEC §7: 4 tab */
const NAV_TABS = [
  { label: 'Beranda',  to: CUSTOMER_ROUTES.BERANDA,          Icon: Home },
  { label: 'Katalog',  to: CUSTOMER_ROUTES.KATALOG,          Icon: Grid2X2 },
  { label: 'Pesanan',  to: CUSTOMER_ROUTES.RIWAYAT_PESANAN,  Icon: ShoppingBag },
  { label: 'Akun',     to: CUSTOMER_ROUTES.AKUN,             Icon: User },
];

export default function CustomerLayout() {
  const navigate = useNavigate();

  return (
    // Bungkus full-height; konten dibatasi 480px di tengah
    <div className="min-h-screen bg-cream flex justify-center">
      <div className="w-full max-w-[480px] flex flex-col min-h-screen relative bg-cream">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-beige px-5 h-14 flex items-center justify-between">
          {/* Logo / nama toko */}
          <button
            onClick={() => navigate(CUSTOMER_ROUTES.BERANDA)}
            className="flex items-center gap-2"
            aria-label="Kembali ke Beranda"
          >
            <span className="font-display text-xl text-cocoa leading-none">Oven &amp; Co.</span>
          </button>

          {/* Aksi kanan: Keranjang */}
          <button
            onClick={() => navigate(CUSTOMER_ROUTES.KERANJANG)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-beige transition-colors relative"
            aria-label="Keranjang belanja"
          >
            <ShoppingBag size={20} className="text-cocoa" />
            {/* Badge jumlah item keranjang — diisi di Step 3 (useCartStore) */}
          </button>
        </header>

        {/* ── Konten halaman ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto pb-[72px]">
          <Outlet />
        </main>

        {/* ── Bottom Nav 4 tab ──────────────────────────────────────────────── */}
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-30
                     bg-surface/95 backdrop-blur-sm border-t border-beige
                     flex items-stretch h-[72px]"
          aria-label="Navigasi utama"
        >
          {NAV_TABS.map(({ label, to, Icon }) => (
            <NavLink
              key={label}
              to={to}
              end={to === CUSTOMER_ROUTES.BERANDA}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] ` +
                `transition-colors duration-150 ` +
                (isActive ? 'text-primary' : 'text-cocoa/40 hover:text-cocoa/70')
              }
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className={`text-[10px] font-semibold ${isActive ? 'text-primary' : ''}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
