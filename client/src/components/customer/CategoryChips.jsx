// components/customer/CategoryChips.jsx
// Step 4 · FR-05 · C-05 — chip kategori menuju Katalog (filter lengkap dibuat di Step 5.1)
// Chip Custom Cake (Pastel Pink) langsung membuka Custom Cake Builder.

import { Link } from 'react-router-dom';
import {
  Cake,
  CakeSlice,
  Cookie,
  Croissant,
  LayoutGrid,
  Wheat,
} from 'lucide-react';

import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { CUSTOM_CAKE_CATEGORY_NAME } from '../../constants/product';

const CATEGORY_ICONS = {
  Roti: Wheat,
  Cake: CakeSlice,
  Pastry: Croissant,
  Cookies: Cookie,
  [CUSTOM_CAKE_CATEGORY_NAME]: Cake,
};

const chipClass = (accent) =>
  `inline-flex items-center gap-2 h-11 px-4 lg:px-5 rounded-pill text-sm font-semibold whitespace-nowrap shrink-0
   border transition-all duration-150 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-sm
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ` +
  (accent
    ? 'bg-pink border-pink text-cocoa hover:border-primary/30'
    : 'bg-surface border-beige text-cocoa hover:border-primary/40');

export default function CategoryChips({
  categories,
  loading,
  error,
  onRetry,
}) {
  // Mode mock & API (Step 6.3) sama-sama mengirim array {category_id, name, sort_order} lewat productService;
  // tidak ada fallback id buatan agar tautan ?kategori= selalu memakai category_id asli.
  const categoryList = Array.isArray(categories) ? categories : [];

  if (error) {
    return (
      <ErrorState
        message="Kategori gagal dimuat."
        onRetry={onRetry}
      />
    );
  }

  return (
    <nav aria-label="Kategori produk">
      <ul className="flex gap-2 md:gap-3 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading && !categories ? (
          Array.from({ length: 6 }).map((_, index) => (
            <li key={index}>
              <Skeleton
                variant="block"
                className="h-11 w-24 rounded-pill"
              />
            </li>
          ))
        ) : (
          [
            { category_id: 'semua', name: 'Semua' },
            ...categoryList,
          ].map((cat) => {
            const isCustom =
              cat.name === CUSTOM_CAKE_CATEGORY_NAME;

            const Icon =
              CATEGORY_ICONS[cat.name] ?? LayoutGrid;

            const to = isCustom
              ? CUSTOMER_ROUTES.CUSTOM_CAKE
              : cat.category_id === 'semua'
                ? CUSTOMER_ROUTES.KATALOG
                : `${CUSTOMER_ROUTES.KATALOG}?kategori=${cat.category_id}`;

            return (
              <li key={cat.category_id}>
                <Link
                  to={to}
                  className={chipClass(isCustom)}
                >
                  <Icon
                    size={18}
                    className="text-primary"
                    aria-hidden="true"
                  />
                  {cat.name}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}
