// components/customer/RatingSummary.jsx
// Step 5.1 · FR-09 · C-10 — rata-rata besar, deretan bintang, total ulasan, 5 batang distribusi

import StarRating from '../ui/StarRating';

export default function RatingSummary({ summary }) {
  return (
    <section aria-label="Ringkasan rating" className="card p-5 md:p-6 flex gap-6 items-center lg:flex-col lg:items-stretch">
      <div className="text-center shrink-0">
        <p className="font-display text-5xl text-cocoa leading-none tabular-nums">
          {summary.average != null ? summary.average.toLocaleString('id-ID', { minimumFractionDigits: 1 }) : '–'}
        </p>
        <StarRating value={summary.average ?? 0} size={16} className="mt-2" />
        <p className="mt-1 text-xs text-cocoa/65">{summary.count} ulasan</p>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5" aria-label="Distribusi bintang">
        {summary.distribution.map(({ stars, count, percent }) => (
          <li key={stars} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-cocoa/70 tabular-nums">{stars}</span>
            <span className="flex-1 h-2 rounded-pill bg-beige overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-pill bg-[#D9A441]" style={{ width: `${percent}%` }} />
            </span>
            <span className="w-6 text-right text-cocoa/70 tabular-nums">{count}</span>
            <span className="sr-only">ulasan bintang {stars}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
