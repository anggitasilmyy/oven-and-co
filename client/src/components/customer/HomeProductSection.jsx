// components/customer/HomeProductSection.jsx
// Step 4 · FR-05 · C-05 — section produk Beranda (Fresh from Oven Today, Best Sellers)
// Grid 2 kolom (HP) · 3 (tablet) · 4 (≥ 1024) · 5 (≥ 1280); di tablet/desktop tampil tepat satu baris.

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import ResponsiveGrid from '../layout/ResponsiveGrid';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import ProductCard from './ProductCard';

const GRID_COLS = { base: 2, md: 3, lg: 4, xl: 5 };

/** Sembunyikan kartu ke-4/5 agar setiap breakpoint menampilkan baris penuh */
const visibility = (index) => ['', '', '', 'md:hidden lg:flex', 'hidden xl:flex'][index] ?? 'hidden';

/**
 * @param {string} id — id judul section (aria-labelledby)
 * @param {Array|null} products
 * @param {Function} [onAdd] — tambah produk ready ke keranjang
 * @param {Function} [renderExtras] — (product, index) → { topRight, footnote }
 */
export default function HomeProductSection({
  id, title, subtitle, linkTo, linkLabel = 'Lihat semua',
  products, loading, error, onRetry, emptyText, onAdd, renderExtras,
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 md:space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="font-display text-2xl md:text-3xl text-cocoa leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-cocoa/70">{subtitle}</p>}
        </div>
        {linkTo && (
          <Link
            to={linkTo}
            className="shrink-0 inline-flex items-center gap-1 min-h-touch-min px-2 -mr-2 rounded-btn text-sm font-semibold text-primary
                       hover:text-cocoa hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {linkLabel}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>

      {error ? (
        <ErrorState message={`${title} gagal dimuat.`} onRetry={onRetry} />
      ) : loading && !products ? (
        <ResponsiveGrid cols={GRID_COLS} gap="sm" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={visibility(i).replace(/flex/g, 'block')}><Skeleton variant="card" /></div>
          ))}
        </ResponsiveGrid>
      ) : products?.length ? (
        <ResponsiveGrid as="ul" cols={GRID_COLS} gap="sm">
          {products.map((product, i) => {
            const extras = renderExtras?.(product, i) ?? {};
            return (
              <li key={product.product_id} className={`flex ${visibility(i)}`}>
                <ProductCard product={product} onAdd={onAdd} className="w-full" {...extras} />
              </li>
            );
          })}
        </ResponsiveGrid>
      ) : (
        <p className="card p-6 text-sm text-cocoa/70 text-center">{emptyText}</p>
      )}
    </section>
  );
}
