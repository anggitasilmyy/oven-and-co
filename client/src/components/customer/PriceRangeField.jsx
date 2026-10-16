// components/customer/PriceRangeField.jsx
// Step 5.1 · FR-06 · C-07 — rentang harga: slider ganda Rp 0 – Rp 500.000 + kolom minimum & maksimum

import { useState } from 'react';
import { PRICE_RANGE } from '../../constants/catalog';
import { formatRupiah } from '../../utils/format';

const { MIN, MAX, STEP } = PRICE_RANGE;
const toFilter = (lo, hi) => ({ minPrice: lo > MIN ? lo : null, maxPrice: hi < MAX ? hi : null });

/** Kolom angka; nilai disimpan saat blur/Enter agar tidak melompat ketika masih diketik */
function PriceInput({ id, label, value, onCommit }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text.replace(/\D/g, ''));
    onCommit(Number.isFinite(n) ? Math.min(Math.max(n, MIN), MAX) : value);
  };
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-cocoa/70 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-cocoa/50 pointer-events-none">Rp</span>
        <input
          id={id}
          inputMode="numeric"
          className="input pl-10 tabular-nums"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </div>
    </div>
  );
}

/**
 * @param {number|null} minPrice
 * @param {number|null} maxPrice
 * @param {Function} onChange — ({minPrice, maxPrice}) → void (null = tidak dibatasi)
 * @param {string} idPrefix — pembeda id bila panel tampil dua kali (sidebar & sheet)
 */
export default function PriceRangeField({ minPrice, maxPrice, onChange, idPrefix = 'harga' }) {
  const lo = minPrice ?? MIN;
  const hi = maxPrice ?? MAX;
  const pct = (v) => ((v - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="space-y-3">
      <p className="text-sm text-cocoa/70 tabular-nums" aria-live="polite">
        {formatRupiah(lo)} – {formatRupiah(hi)}{hi === MAX ? '+' : ''}
      </p>
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-pill bg-beige" aria-hidden="true" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-pill bg-primary"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          aria-hidden="true"
        />
        <input
          type="range" min={MIN} max={MAX} step={STEP} value={lo}
          aria-label="Harga minimum"
          aria-valuetext={formatRupiah(lo)}
          className="dual-range"
          // Thumb minimum di atas bila berada di separuh kanan agar dua thumb yang bertumpuk tetap bisa digeser
          style={{ zIndex: lo > (MIN + MAX) / 2 ? 2 : 1 }}
          onChange={(e) => onChange(toFilter(Math.min(Number(e.target.value), hi), hi))}
        />
        <input
          type="range" min={MIN} max={MAX} step={STEP} value={hi}
          aria-label="Harga maksimum"
          aria-valuetext={formatRupiah(hi)}
          className="dual-range"
          onChange={(e) => onChange(toFilter(lo, Math.max(Number(e.target.value), lo)))}
        />
      </div>
      <div className="flex gap-3">
        {/* key: kolom ikut berubah saat slider digeser */}
        <PriceInput
          key={`min-${lo}`} id={`${idPrefix}-min`} label="Minimum" value={lo}
          onCommit={(v) => onChange(toFilter(Math.min(v, hi), Math.max(hi, v)))}
        />
        <PriceInput
          key={`max-${hi}`} id={`${idPrefix}-max`} label="Maksimum" value={hi}
          onCommit={(v) => onChange(toFilter(Math.min(lo, v), Math.max(v, lo)))}
        />
      </div>
    </div>
  );
}
