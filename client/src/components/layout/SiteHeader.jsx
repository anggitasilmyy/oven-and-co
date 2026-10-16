// components/layout/SiteHeader.jsx
// Step 2.5 (PR A) · SPEC §7 · NFR-06 (CR-01)
// < md  : logo + keranjang (navigasi utama ada di BottomNav)
// md–lg : top navigation ringkas — logo, 4 menu (teks), keranjang
// ≥ lg  : top navigation penuh — logo, 4 menu (ikon + teks), keranjang berlabel

import { NavLink } from 'react-router-dom';
import { CUSTOMER_NAV_ITEMS } from '../../constants/navigation';
import BrandLogo from './BrandLogo';
import CartButton from './CartButton';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-beige">
      <div className="page-container h-14 md:h-16 flex items-center gap-4 lg:gap-8">
        <BrandLogo />

        {/* Top navigation — hanya ≥ md */}
        <nav
          data-layout="top-nav"
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-1 lg:gap-2 flex-1 md:justify-center lg:justify-start"
        >
          {CUSTOMER_NAV_ITEMS.map(({ label, to, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 h-11 px-3 lg:px-4 rounded-pill text-sm font-semibold
                 transition-colors duration-150 active:scale-[0.97]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ` +
                (isActive ? 'bg-beige text-primary' : 'text-cocoa/70 hover:text-cocoa hover:bg-beige/60')
              }
            >
              <Icon size={18} className="hidden lg:block" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto md:ml-0 flex items-center">
          <CartButton />
        </div>
      </div>
    </header>
  );
}
