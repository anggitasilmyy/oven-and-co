// components/customer/CostSummary.jsx
// Step 5.3 · FR-11 · FR-13 · C-12 · C-13 — kartu ringkasan biaya (subtotal, ongkir, diskon, poin, total)

import { formatRupiah } from '../../utils/format';

/**
 * @param {Array<{label, amount, discount?: boolean}>} rows — baris biaya; discount ditampilkan "-Rp …"
 * @param {number} [total] — bila diisi, baris Total tebal di bawah
 * @param {string} [note] — catatan kecil di bawah
 */
export default function CostSummary({ title = 'Ringkasan biaya', rows, total, note }) {
  return (
    <section aria-label={title} className="card p-4 md:p-6">
      <h2 className="font-display text-xl text-cocoa mb-2">{title}</h2>
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <dt className="text-cocoa/70">{r.label}</dt>
            <dd className={`font-semibold tabular-nums text-right ${r.discount ? 'text-[#3F6B3A]' : 'text-cocoa'}`}>
              {r.discount ? `-${formatRupiah(r.amount)}` : formatRupiah(r.amount)}
            </dd>
          </div>
        ))}
        {total != null && (
          <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-beige">
            <dt className="font-bold text-cocoa">Total</dt>
            <dd className="font-bold text-lg text-primary tabular-nums">{formatRupiah(total)}</dd>
          </div>
        )}
      </dl>
      {note && <p className="mt-3 text-xs text-cocoa/65">{note}</p>}
    </section>
  );
}
