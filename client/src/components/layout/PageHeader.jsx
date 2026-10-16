// components/layout/PageHeader.jsx
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Judul halaman seragam: kode layar, judul, deskripsi, dan slot aksi di kanan (≥ md).

/**
 * @param {string} screenCode — kode layar, mis. "C-06" atau "AD-03"
 * @param {string} title
 * @param {React.ReactNode} description
 * @param {React.ReactNode} actions — tombol aksi; di HP turun ke bawah judul
 */
export default function PageHeader({ screenCode, title, description, actions, className = '' }) {
  return (
    <div
      className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6 ${className}`}
    >
      <div className="min-w-0">
        {screenCode && (
          <p className="text-xs font-semibold text-primary tracking-widest uppercase mb-1">
            {screenCode}
          </p>
        )}
        <h1 className="font-display text-3xl lg:text-4xl text-cocoa leading-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-sm md:text-base text-cocoa/70 max-w-prose">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
