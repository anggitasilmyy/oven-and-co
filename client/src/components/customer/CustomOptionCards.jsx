// components/customer/CustomOptionCards.jsx
// FR-10 · FR-31 · C-11 — kartu opsi yang bisa dipilih (foto/ikon, nama, keterangan, harga tambahan, tanda centang)
// Hanya opsi aktif yang tampil (diatur service). Satu pilihan per kelompok (asumsi TF-08).

import { Check, Circle, Heart, Ruler, Square } from 'lucide-react';
import ProductImage from '../ui/ProductImage';
import { formatRupiah } from '../../utils/format';
import { cakeShapeOf, flavorColorOf, creamVisualOf } from '../../utils/cakeVisual';
import { CUSTOM_OPTION_GROUP } from '../../constants/customCake';

const SHAPE_ICONS = { round: Circle, square: Square, heart: Heart };

/** Ikon opsi bila admin belum mengunggah image_url */
function OptionIcon({ option }) {
  if (option.image_url) {
    return <ProductImage src={option.image_url} className="w-full h-full object-cover" />;
  }
  if (option.option_group === CUSTOM_OPTION_GROUP.BENTUK) {
    const Icon = SHAPE_ICONS[cakeShapeOf(option)];
    return <Icon size={22} aria-hidden="true" />;
  }
  if (option.option_group === CUSTOM_OPTION_GROUP.UKURAN) return <Ruler size={22} aria-hidden="true" />;
  const color = option.option_group === CUSTOM_OPTION_GROUP.RASA ? flavorColorOf(option) : creamVisualOf(option).top;
  return <span className="w-6 h-6 rounded-full border border-cocoa/15" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/**
 * @param {string} legend — judul kelompok (untuk pembaca layar)
 * @param {object[]} options — opsi aktif satu kelompok
 * @param {number|null} value — option_id terpilih
 */
export default function CustomOptionCards({ legend, options, value, onChange }) {
  if (!options.length) {
    return <p className="text-sm text-cocoa/70">Belum ada pilihan untuk langkah ini. Silakan hubungi toko.</p>;
  }
  return (
    <div role="radiogroup" aria-label={legend} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {options.map((o) => {
        const selected = value === o.option_id;
        return (
          <button
            key={o.option_id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.option_id)}
            className={`relative flex items-center gap-3 text-left rounded-card border-2 p-3 min-h-[76px] transition
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                        ${selected ? 'border-primary bg-pink/40' : 'border-beige bg-surface hover:border-primary/40'}`}
          >
            <span className="w-12 h-12 shrink-0 overflow-hidden rounded-btn bg-pink/60 text-primary flex items-center justify-center">
              <OptionIcon option={o} />
            </span>
            <span className="min-w-0 flex-1 pr-6">
              <span className="block font-semibold text-cocoa leading-snug">{o.name}</span>
              {o.description && <span className="block text-xs text-cocoa/65">{o.description}</span>}
              <span className="block text-xs font-semibold text-primary tabular-nums mt-0.5">
                {o.extra_price > 0 ? `+${formatRupiah(o.extra_price)}` : 'Tanpa biaya tambahan'}
              </span>
            </span>
            {selected && (
              <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                <Check size={14} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
