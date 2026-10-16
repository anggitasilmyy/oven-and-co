// components/layout/CartButton.jsx
// Step 2.5 (PR A) · FR-04, FR-11 · Ikon keranjang di header + badge jumlah item
// Badge = total quantity dari useCartStore.items (hanya MEMBACA store, tidak mengubah logika)

import { NavLink } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import useCartStore from '../../stores/useCartStore';

/** Batas angka yang ditampilkan di badge */
const BADGE_MAX = 99;

export default function CartButton() {
  const items = useCartStore((s) => s.items);
  const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const label = count > 0 ? `Keranjang belanja, ${count} item` : 'Keranjang belanja';

  return (
    <NavLink
      to={CUSTOMER_ROUTES.KERANJANG}
      aria-label={label}
      className={({ isActive }) =>
        `relative inline-flex items-center justify-center gap-2 min-w-touch-min h-11 rounded-pill
         px-2.5 lg:px-4 transition-colors duration-150 active:scale-[0.97]
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ` +
        (isActive ? 'bg-beige text-primary' : 'text-cocoa hover:bg-beige')
      }
    >
      <ShoppingBag size={20} aria-hidden="true" />
      <span className="hidden lg:inline text-sm font-semibold">Keranjang</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 left-6 lg:static min-w-[18px] h-[18px] px-1 rounded-pill
                     bg-primary text-white text-[10px] font-bold leading-[18px] text-center tabular-nums"
        >
          {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
        </span>
      )}
    </NavLink>
  );
}
