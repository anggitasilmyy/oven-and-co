// components/admin/Pagination.jsx
// Step 4 · AD-03 — navigasi halaman tabel (Sebelumnya / nomor / Berikutnya)

import { ChevronLeft, ChevronRight } from 'lucide-react';

const btn =
  'inline-flex items-center justify-center min-w-touch-min h-11 px-3 rounded-lg text-sm font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed';

/** @param {number} page @param {number} totalPages @param {Function} onChange */
export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Halaman daftar pesanan" className="flex items-center justify-center gap-1 flex-wrap">
      <button type="button" className={`${btn} text-cocoa hover:bg-beige`} disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Sebelumnya</span>
      </button>
      {/* < 640 px: teks ringkas menggantikan deretan nomor halaman */}
      <span className="sm:hidden px-3 text-sm text-cocoa/80 tabular-nums">Halaman {page} dari {totalPages}</span>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? 'page' : undefined}
          aria-label={`Halaman ${n}`}
          className={`${btn} hidden sm:inline-flex ${n === page ? 'bg-primary text-white' : 'text-cocoa hover:bg-beige'}`}
        >
          {n}
        </button>
      ))}
      <button type="button" className={`${btn} text-cocoa hover:bg-beige`} disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        <span className="hidden sm:inline">Berikutnya</span> <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
