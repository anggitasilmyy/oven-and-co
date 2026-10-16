// components/customer/PointsToggle.jsx
// Step 5.3 · FR-13 · BR-09 · BR-10 · C-13 — "Gunakan X poin (hemat Rp Y)"; 100 poin = Rp 5.000, poin ≤ saldo

import { Coins } from 'lucide-react';
import { formatRupiah } from '../../utils/format';

/**
 * @param {number} balance — saldo poin
 * @param {{points, value}} redeemable — poin maksimal yang bisa ditukar untuk pesanan ini
 */
export default function PointsToggle({ balance, redeemable, checked, onChange }) {
  const disabled = redeemable.points === 0;
  return (
    <label className={`card p-4 flex items-center gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <Coins size={20} className="text-primary shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-cocoa">
          {disabled ? 'Tukar poin' : `Gunakan ${redeemable.points.toLocaleString('id-ID')} poin (hemat ${formatRupiah(redeemable.value)})`}
        </span>
        <span className="block text-xs text-cocoa/65">Saldo {balance.toLocaleString('id-ID')} poin{disabled ? ' · minimal 100 poin' : ''}</span>
      </span>
      {/* Switch: checkbox asli agar bisa dipakai keyboard & pembaca layar */}
      <input
        type="checkbox"
        role="switch"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative w-12 h-7 shrink-0 rounded-full bg-beige transition peer-checked:bg-primary
                   peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50
                   after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition
                   peer-checked:after:translate-x-5"
      />
    </label>
  );
}
