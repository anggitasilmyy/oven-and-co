// components/ui/StarRating.jsx
// Step 5.1 · FR-09 — deretan 5 bintang (warna Caramel sesuai UI/UX Spec)

import { Star } from 'lucide-react';

/**
 * @param {number} value — rating 0–5 (dibulatkan ke bintang terdekat)
 * @param {number} size — ukuran ikon (px)
 */
export default function StarRating({ value = 0, size = 14, className = '' }) {
  const filled = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`Rating ${String(value).replace('.', ',')} dari 5`}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          className={n <= filled ? 'fill-[#D9A441] text-[#D9A441]' : 'fill-beige text-beige'}
        />
      ))}
    </span>
  );
}
