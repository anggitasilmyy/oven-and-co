// components/admin/LowStockPanel.jsx
// Step 4 · FR-27 · FR-32 · AD-02 — peringatan Stok Menipis (bahan baku dengan stok ≤ minimum)

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatNumber } from '../../utils/format';

/** @param {Array<{material_id, name, unit, stock, min_stock}>} materials — sudah difilter ≤ minimum */
export default function LowStockPanel({ materials }) {
  if (!materials.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-cocoa/80">
        <CheckCircle2 size={18} className="text-green-700" aria-hidden="true" /> Semua bahan baku di atas batas minimum.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {materials.map((m) => (
        <li key={m.material_id} className="flex items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5">
          <AlertTriangle size={18} className="text-error shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-cocoa truncate">{m.name}</p>
            <p className="text-xs text-cocoa/70 tabular-nums">
              Sisa {formatNumber(m.stock)} {m.unit} · minimum {formatNumber(m.min_stock)} {m.unit}
            </p>
          </div>
          <span className="badge bg-red-100 text-error shrink-0">Menipis</span>
        </li>
      ))}
    </ul>
  );
}
