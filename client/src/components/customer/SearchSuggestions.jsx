// components/customer/SearchSuggestions.jsx
// Step 5.1 · FR-07 · C-08 — "Pencarian terakhir" (riwayat perangkat) dan chip "Populer"

import { Clock, TrendingUp, X } from 'lucide-react';
import Chip from '../ui/Chip';
import { POPULAR_SEARCHES } from '../../constants/catalog';

/** Chip pencarian populer — dipakai juga sebagai saran di empty state */
export function PopularSearchChips({ onSelect, title = 'Populer' }) {
  return (
    <section aria-labelledby="cari-populer" className="space-y-3">
      <h2 id="cari-populer" className="flex items-center gap-2 font-sans text-sm font-bold text-cocoa">
        <TrendingUp size={16} className="text-primary" aria-hidden="true" />
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map((term) => (
          <Chip key={term} onClick={() => onSelect(term)}>{term}</Chip>
        ))}
      </div>
    </section>
  );
}

/**
 * @param {string[]} history — kata kunci terbaru dulu
 */
export default function SearchSuggestions({ history, onSelect, onRemove, onClear }) {
  return (
    <div className="space-y-8 lg:grid lg:grid-cols-2 lg:gap-10 lg:space-y-0">
      <section aria-labelledby="cari-terakhir" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="cari-terakhir" className="font-sans text-sm font-bold text-cocoa">Pencarian terakhir</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="min-h-touch-min px-2 -mr-2 rounded-btn text-sm font-semibold text-primary hover:bg-beige/60
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Hapus semua
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-cocoa/60">Belum ada riwayat pencarian di perangkat ini.</p>
        ) : (
          <ul className="divide-y divide-beige card px-2">
            {history.map((term) => (
              <li key={term} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onSelect(term)}
                  className="flex-1 min-w-0 flex items-center gap-3 min-h-[48px] px-2 text-left text-sm text-cocoa rounded-btn
                             hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Clock size={16} className="text-cocoa/50 shrink-0" aria-hidden="true" />
                  <span className="truncate">{term}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(term)}
                  aria-label={`Hapus "${term}" dari riwayat`}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-cocoa/50
                             hover:bg-beige hover:text-cocoa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PopularSearchChips onSelect={onSelect} />
    </div>
  );
}
