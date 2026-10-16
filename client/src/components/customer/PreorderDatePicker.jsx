// components/customer/PreorderDatePicker.jsx
// Step 5.1 · FR-08 · F-09 · BR-02 — "Tanggal ambil/antar"; tanggal sebelum tanggal siap tercepat dinonaktifkan

import { buildDateOptions } from '../../utils/businessRules';
import { parseDateKey } from '../../utils/date';
import { formatDate } from '../../utils/format';
import { PREORDER_DATE_WINDOW_DAYS } from '../../constants/productDetail';

/**
 * @param {string} todayKey
 * @param {string} earliestKey — tanggal siap tercepat (BR-02)
 * @param {string|null} value — kunci tanggal terpilih
 * @param {string} cutoffTime — store_settings.preorder_cutoff_time
 * @param {number} [days] — Step 5.2: jumlah hari yang ditampilkan (C-11 memakai rentang lebih panjang)
 */
export default function PreorderDatePicker({ todayKey, earliestKey, value, onChange, cutoffTime, days = PREORDER_DATE_WINDOW_DAYS }) {
  const options = buildDateOptions(todayKey, earliestKey, days);
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-bold text-cocoa mb-1">Tanggal ambil/antar</legend>
      <p id="tanggal-hint" className="text-xs text-cocoa/65 mb-3">
        Paling cepat {formatDate(parseDateKey(earliestKey))}.
        {cutoffTime && ` Pesanan setelah pukul ${cutoffTime.replace(':', '.')} siap sehari lebih lambat.`}
      </p>
      <div
        role="radiogroup"
        aria-describedby="tanggal-hint"
        className="flex gap-2 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {options.map(({ dateKey, disabled }) => {
          const date = parseDateKey(dateKey);
          const selected = value === dateKey;
          const [weekday] = formatDate(date).split(',');
          return (
            <button
              key={dateKey}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={formatDate(date) + (disabled ? ' (belum tersedia)' : '')}
              disabled={disabled}
              onClick={() => onChange(dateKey)}
              data-date={dateKey}
              className={`shrink-0 w-[68px] min-h-[64px] rounded-btn border flex flex-col items-center justify-center gap-0.5
                          text-xs font-semibold transition
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                          disabled:bg-beige/40 disabled:border-beige disabled:text-cocoa/35 disabled:line-through disabled:cursor-not-allowed
                          ${selected ? 'bg-primary border-primary text-white' : 'bg-surface border-beige text-cocoa hover:border-primary/40'}`}
            >
              <span className="text-[11px] font-medium">{weekday.slice(0, 3)}</span>
              <span className="text-lg leading-none tabular-nums">{date.getDate()}</span>
              <span className="text-[11px] font-medium">{date.toLocaleDateString('id-ID', { month: 'short' })}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
