// components/layout/BottomNav.jsx
// Step 2.5 (PR A) · SPEC §7 — bottom nav 4 tab, HANYA < md (768 px)

import { NavLink } from 'react-router-dom';
import { CUSTOMER_NAV_ITEMS } from '../../constants/navigation';

export default function BottomNav() {
  return (
    <nav
      data-layout="bottom-nav"
      aria-label="Navigasi bawah"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-surface/95 backdrop-blur-sm
                 border-t border-beige pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch h-[72px]">
        {CUSTOMER_NAV_ITEMS.map(({ label, to, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-touch-min
               transition-colors duration-150 active:bg-beige/60
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ` +
              (isActive ? 'text-primary' : 'text-cocoa/60 hover:text-cocoa')
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                <span className="text-[11px] font-semibold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
