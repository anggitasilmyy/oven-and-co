// components/customer/CustomCakeBanner.jsx
// Step 4 · FR-05 · FR-10 · C-05 — banner "Design Your Celebration Cake" (Pastel Pink) → C-11
// Harga mulai & lead time diambil dari produk custom (productService), bukan ditulis di UI.

import { Link } from 'react-router-dom';
import { CalendarClock, Sparkles } from 'lucide-react';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { formatRupiah } from '../../utils/format';
import ProductImage from '../ui/ProductImage';

/** @param {object|null} product — produk custom aktif; null = info harga belum tersedia */
export default function CustomCakeBanner({ product }) {
  return (
    <section
      aria-labelledby="custom-cake-banner"
      className="relative overflow-hidden rounded-card bg-pink px-5 py-7 md:px-10 md:py-10 lg:px-14 lg:py-12
                 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="absolute -right-16 -bottom-20 w-72 h-72 rounded-full bg-surface/30" aria-hidden="true" />
      <div className="relative space-y-3 max-w-xl">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles size={14} aria-hidden="true" /> Custom Cake
        </p>
        <h2 id="custom-cake-banner" className="font-display text-2xl md:text-4xl text-cocoa leading-tight">
          Design Your Celebration Cake
        </h2>
        <p className="text-sm md:text-base text-cocoa/80">Rancang kue untuk momen spesialmu.</p>
        {product && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cocoa">
            <span>Mulai <strong className="tabular-nums">{formatRupiah(product.price)}</strong></span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={16} className="text-primary" aria-hidden="true" />
              Pesan minimal H-{product.lead_time_days}
            </span>
          </p>
        )}
        <Link
          to={CUSTOMER_ROUTES.CUSTOM_CAKE}
          className="inline-flex items-center justify-center h-btn px-6 mt-2 rounded-btn bg-primary text-white font-semibold
                     hover:bg-cocoa active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-offset-2 focus-visible:ring-offset-pink focus-visible:ring-primary"
        >
          Mulai Desain
        </Link>
      </div>
      {product?.image_url && (
        <ProductImage
          src={product.image_url}
          loading="lazy"
          sizes="256px"
          className="relative hidden md:block w-48 h-48 lg:w-64 lg:h-64 rounded-full object-cover shadow-lg ring-8 ring-surface/60"
        />
      )}
    </section>
  );
}
