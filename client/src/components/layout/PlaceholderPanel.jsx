// components/layout/PlaceholderPanel.jsx
// Step 2.5 (PR B) · Penanda area konten yang BELUM diimplementasi (bukan data dummy).
// Dipakai halaman placeholder agar kerangka responsif siap diisi pada Step 4/5.

import { Construction } from 'lucide-react';

/**
 * @param {string} step — jadwal implementasi, mis. "Step 5.1"
 * @param {string} refs — requirement terkait, mis. "FR-11 · BR-04"
 * @param {boolean} compact — versi ringkas (mis. di dalam ActionBar)
 * @param {React.ReactNode} children — uraian isi yang akan dibuat
 */
export default function PlaceholderPanel({ step, refs, compact = false, className = '', children }) {
  return (
    <div
      className={`rounded-card border-2 border-dashed border-primary/25 bg-surface/60 text-cocoa/75
                  ${compact ? 'px-4 py-3 text-xs' : 'p-5 md:p-6 text-sm'} ${className}`}
    >
      <p className="flex items-center gap-2 font-semibold text-cocoa">
        <Construction size={compact ? 14 : 16} className="text-primary shrink-0" aria-hidden="true" />
        <span>
          Belum diimplementasi{step ? ` · ${step}` : ''}
          {refs && <span className="font-normal text-cocoa/70"> ({refs})</span>}
        </span>
      </p>
      {children && <div className={`${compact ? 'mt-1' : 'mt-2'} leading-relaxed`}>{children}</div>}
    </div>
  );
}
