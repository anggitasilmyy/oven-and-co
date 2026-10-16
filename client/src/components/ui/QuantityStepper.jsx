// components/ui/QuantityStepper.jsx
// Step 5.1 · FR-08 — stepper jumlah (minus, angka, plus); validation rule 1 ≤ jumlah ≤ max

import { Minus, Plus } from 'lucide-react';

const btn =
  'w-11 h-11 flex items-center justify-center rounded-full text-cocoa transition ' +
  'hover:bg-beige active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

/**
 * @param {number} value
 * @param {number} max — 0 berarti tidak bisa diubah
 * @param {Function} onChange — (nextValue) → void
 * @param {string} label — label untuk pembaca layar
 */
export default function QuantityStepper({ value, max, onChange, label = 'Jumlah', min = 1 }) {
  const disabled = max < min;
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-pill border border-beige bg-surface p-0.5">
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label={`Kurangi ${label.toLowerCase()}`}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-[2.5rem] text-center font-bold text-cocoa tabular-nums">
        {disabled ? 0 : value}
      </output>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label={`Tambah ${label.toLowerCase()}`}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
