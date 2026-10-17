// components/ui/StarRatingInput.jsx
// Step 5.4 · FR-21 · C-19 — 5 bintang besar yang bisa diketuk (warna Caramel seperti StarRating), area sentuh 44 px

import { Star } from 'lucide-react';

const LABELS = ['Sangat kurang', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus'];

/**
 * @param {number} value — 0 = belum dipilih, 1–5
 * @param {Function} onChange — (rating) → void
 */
export default function StarRatingInput({ value = 0, onChange, labelId }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-labelledby={labelId} className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} bintang`}
            onClick={() => onChange(n)}
            className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center rounded-full transition active:scale-90
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Star
              size={32}
              aria-hidden="true"
              className={n <= value ? 'fill-[#D9A441] text-[#D9A441]' : 'fill-beige text-[#A07D5C]'}
            />
          </button>
        ))}
      </div>
      {value > 0 && <span className="text-sm font-semibold text-cocoa" aria-live="polite">{LABELS[value - 1]}</span>}
    </div>
  );
}
