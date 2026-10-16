// components/customer/VariantChips.jsx
// Step 5.1 · FR-08 · C-09 — chip varian "Pilihan" (product_variants aktif) + harga tambahan

import Chip from '../ui/Chip';
import { formatRupiah } from '../../utils/format';

export default function VariantChips({ variants, value, onChange }) {
  if (!variants.length) return null;
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-bold text-cocoa mb-3">Pilihan</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <Chip key={v.variant_id} selected={value === v.variant_id} onClick={() => onChange(v.variant_id)}>
            {v.name}
            {v.extra_price > 0 && (
              <span className={`font-medium ${value === v.variant_id ? 'text-white/85' : 'text-cocoa/60'}`}>
                (+{formatRupiah(v.extra_price)})
              </span>
            )}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
