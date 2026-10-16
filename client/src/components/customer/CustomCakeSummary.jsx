// components/customer/CustomCakeSummary.jsx
// FR-10 · C-11 — ringkasan semua pilihan dengan tautan "Ubah" (PRD 7.3 langkah 5)

import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { CUSTOM_CAKE_STEPS, CUSTOM_CAKE_STEP } from '../../constants/customCake';

/** Teks nilai satu langkah */
function valueOf(step, design, selectedOptions) {
  if (step.group) {
    const option = selectedOptions.find((o) => o.option_group === step.group);
    if (!option) return { text: 'Belum dipilih' };
    return { text: option.name, extra: option.extra_price > 0 ? `+${formatRupiah(option.extra_price)}` : null };
  }
  if (step.key === CUSTOM_CAKE_STEP.TULISAN) {
    const text = design.writingText.trim();
    const writing = text ? `"${text}" · ${design.writingColor}` : 'Tanpa tulisan';
    return { text: design.referencePhoto ? `${writing} · dengan foto referensi` : writing };
  }
  return { text: design.readyDate ? formatDate(parseDateKey(design.readyDate)) : 'Belum dipilih' };
}

/**
 * @param {number} basePrice — harga dasar produk custom
 * @param {Function} onEdit — (stepIndex) → buka langkah
 */
export default function CustomCakeSummary({ design, selectedOptions, basePrice, onEdit }) {
  return (
    <section aria-labelledby="ringkasan-desain" className="card p-4 md:p-6">
      <h3 id="ringkasan-desain" className="font-display text-xl text-cocoa mb-2">Ringkasan desain</h3>
      <dl className="divide-y divide-beige">
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <dt className="text-cocoa/70">Harga dasar</dt>
          <dd className="font-semibold text-cocoa tabular-nums">{formatRupiah(basePrice)}</dd>
        </div>
        {CUSTOM_CAKE_STEPS.map((step, index) => {
          const value = valueOf(step, design, selectedOptions);
          return (
            <div key={step.key} className="flex items-center gap-3 py-1.5 text-sm">
              <dt className="w-24 md:w-32 shrink-0 text-cocoa/70">{step.label}</dt>
              <dd className="min-w-0 flex-1 text-cocoa">
                <span className="font-semibold break-words">{value.text}</span>
                {value.extra && <span className="block text-xs text-primary tabular-nums">{value.extra}</span>}
              </dd>
              {index < CUSTOM_CAKE_STEPS.length - 1 && (
                <button
                  type="button"
                  onClick={() => onEdit(index)}
                  className="shrink-0 min-h-touch-min px-3 -mr-3 rounded-btn text-sm font-semibold text-primary hover:underline
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={`Ubah ${step.label}`}
                >
                  Ubah
                </button>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
