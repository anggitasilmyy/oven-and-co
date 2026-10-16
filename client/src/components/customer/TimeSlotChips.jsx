// components/customer/TimeSlotChips.jsx
// Step 5.3 · FR-12 · C-13 — chip slot waktu dalam jam operasional; slot hari ini yang sudah lewat nonaktif

import Chip from '../ui/Chip';

/** @param {Array<{label, disabled}>} slots */
export default function TimeSlotChips({ slots, value, onChange }) {
  const allPassed = slots.every((s) => s.disabled);
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-bold text-cocoa mb-3">Slot waktu</legend>
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Chip key={s.label} selected={value === s.label} disabled={s.disabled} onClick={() => onChange(s.label)} className="tabular-nums">
            {s.label}
          </Chip>
        ))}
      </div>
      {allPassed && (
        <p className="mt-2 text-xs text-error" role="status">Slot hari ini sudah habis. Produk ready hanya bisa diambil/diantar hari ini.</p>
      )}
    </fieldset>
  );
}
