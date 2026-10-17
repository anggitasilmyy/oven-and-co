// components/admin/ProductRating.jsx
// Step 5.7 · FR-30 · AD-06 — rata-rata rating produk (ulasan disembunyikan tidak dihitung) untuk tabel admin

import { Star } from 'lucide-react';

/** @param {{average: number|null, count: number}} rating */
export default function ProductRating({ rating }) {
  if (rating?.average == null) return <span className="text-cocoa/60">Belum ada</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Star size={14} className="fill-[#D9A441] text-[#D9A441]" aria-hidden="true" />
      {String(rating.average).replace('.', ',')} <span className="text-cocoa/60">({rating.count})</span>
    </span>
  );
}
