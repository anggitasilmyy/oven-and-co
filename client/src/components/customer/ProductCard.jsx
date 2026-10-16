// components/customer/ProductCard.jsx
// Step 4 · FR-05 (C-05) — dipakai ulang di Katalog & Pencarian (Step 5.1)
// Foto, badge ketersediaan, nama, rating, harga Rupiah, dan tombol "+" untuk produk ready.

import { Link } from 'react-router-dom';
import { Plus, Star } from 'lucide-react';
import Badge from '../ui/Badge';
import { formatRupiah } from '../../utils/format';
import { AVAILABILITY_TYPE, AVAILABILITY_BADGE, SOLD_OUT_BADGE } from '../../constants/product';
import { productHref } from '../../utils/productLinks';

/**
 * @param {object} product — hasil productService (product_id, name, price, availability_type, image_url, rating, remaining_today)
 * @param {Function} [onAdd] — tambah ke keranjang (hanya produk ready yang masih ada stok)
 * @param {React.ReactNode} [topRight] — penanda tambahan di pojok kanan atas foto (mis. peringkat)
 * @param {React.ReactNode} [footnote] — info kecil di bawah harga (mis. jumlah terjual)
 */
export default function ProductCard({ product, onAdd, topRight, footnote, className = '' }) {
  const isReady = product.availability_type === AVAILABILITY_TYPE.READY;
  const soldOut = isReady && product.remaining_today === 0;
  const badge = soldOut ? SOLD_OUT_BADGE : AVAILABILITY_BADGE[product.availability_type];
  const canAdd = Boolean(onAdd) && isReady && !soldOut;
  const pricePrefix = product.availability_type === AVAILABILITY_TYPE.CUSTOM ? 'Mulai ' : '';

  return (
    <article
      className={`group relative card overflow-hidden flex flex-col transition-all duration-200
                  hover:shadow-md hover:-translate-y-0.5 focus-within:shadow-md ${className}`}
    >
      <Link
        to={productHref(product)}
        className="flex flex-col flex-1 rounded-card focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-inset focus-visible:ring-primary/60 active:opacity-90"
      >
        <div className="relative aspect-square overflow-hidden bg-beige">
          {product.image_url && (
            <img
              src={product.image_url}
              alt=""
              loading="lazy"
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105
                          ${soldOut ? 'grayscale-[60%] opacity-80' : ''}`}
            />
          )}
          {badge && (
            <Badge variant={badge.variant} className="absolute top-2.5 left-2.5 shadow-sm !px-2.5 text-[11px]">
              {badge.label}
            </Badge>
          )}
          {topRight && <div className="absolute top-2.5 right-2.5">{topRight}</div>}
        </div>

        <div className="flex flex-col flex-1 gap-1.5 p-3 md:p-4">
          <h3 className="font-sans font-semibold text-sm md:text-[15px] text-cocoa leading-snug line-clamp-2 min-h-[2.5em]">
            {product.name}
          </h3>
          <p className="flex items-center gap-1 text-xs text-cocoa/70">
            <Star size={13} className="fill-[#D9A441] text-[#D9A441] shrink-0" aria-hidden="true" />
            {product.rating?.count ? (
              <span>
                <span className="font-semibold text-cocoa">{product.rating.average.toLocaleString('id-ID')}</span>
                {` (${product.rating.count})`}
                <span className="sr-only"> ulasan</span>
              </span>
            ) : (
              <span>Belum ada ulasan</span>
            )}
          </p>
          {footnote && <p className="text-[11px] text-cocoa/60">{footnote}</p>}
          {/* Ruang kanan untuk tombol "+" hanya di baris harga */}
          <p
            className={`mt-auto pt-1 min-h-[44px] flex items-center font-bold text-primary text-sm md:text-base tabular-nums
                        ${canAdd ? 'pr-12' : ''}`}
          >
            {pricePrefix}
            {formatRupiah(product.price)}
          </p>
        </div>
      </Link>

      {canAdd && (
        <button
          type="button"
          onClick={() => onAdd(product)}
          aria-label={`Tambah ${product.name} ke keranjang`}
          className="absolute bottom-3 right-3 md:bottom-4 md:right-4 w-11 h-11 rounded-full bg-primary text-white
                     flex items-center justify-center shadow-md transition-all duration-150
                     hover:bg-cocoa hover:scale-105 active:scale-95
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      )}
    </article>
  );
}
