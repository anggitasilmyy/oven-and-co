// components/admin/KpiCard.jsx
// Step 4 · FR-27 · AD-02 — kartu KPI (ikon, label, nilai, keterangan)

import { Link } from 'react-router-dom';

/**
 * @param {React.ComponentType} icon — ikon lucide
 * @param {string} label
 * @param {React.ReactNode} value
 * @param {React.ReactNode} [hint] — keterangan kecil di bawah nilai
 * @param {string} [to] — bila diisi, kartu menjadi tautan
 * @param {string} [tone] — kelas warna latar ikon
 */
export default function KpiCard({ icon: Icon, label, value, hint, to, tone = 'bg-beige text-primary' }) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <p className="text-xs md:text-sm font-semibold text-cocoa/75 leading-tight">{label}</p>
      </div>
      <p className="mt-3 font-sans font-bold text-cocoa text-lg sm:text-2xl lg:text-[28px] leading-none tabular-nums break-words">
        {value}
      </p>
      {hint && <div className="mt-2 text-xs text-cocoa/70">{hint}</div>}
    </>
  );
  const base = 'card-admin p-4 md:p-5 block min-w-0';
  return to ? (
    <Link
      to={to}
      className={`${base} transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
