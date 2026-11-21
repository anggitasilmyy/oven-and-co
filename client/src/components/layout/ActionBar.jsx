// components/layout/ActionBar.jsx
// Step 2.5 (PR A) · SPEC §7 sticky bottom bar (mobile) / panel aksi sticky (desktop)
// < lg : bar fixed di bawah layar, lebar penuh (konten dibatasi max-w-content)
// ≥ lg : kartu sticky di kolom kanan FocusPageGrid

/**
 * @param {React.ReactNode} summary — ringkasan (mis. total harga); di desktop tampil di atas tombol
 * @param {React.ReactNode} children — tombol aksi utama
 * @param {string} label — aria-label wilayah aksi
 */
// Step 8 · F-05: `aboveBottomNav` untuk halaman di CustomerLayout (C-19) — < md bar berada tepat di atas BottomNav
// (72 px + safe area, sama dengan CustomerLayout) agar tidak saling menutupi; ≥ md BottomNav tidak ada → bawah layar.
export default function ActionBar({ summary, children, label = 'Aksi halaman', aboveBottomNav = false, className = '' }) {
  return (
    <aside
      aria-label={label}
      data-layout="action-bar"
      className={[
        // Mobile & tablet: fixed di bawah (atau di atas BottomNav)
        'fixed inset-x-0 z-30 bg-surface/95 backdrop-blur-sm border-t border-beige',
        aboveBottomNav
          ? 'bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-0 md:pb-[env(safe-area-inset-bottom)]'
          : 'bottom-0 pb-[env(safe-area-inset-bottom)]',
        // Desktop: kartu sticky
        'lg:sticky lg:top-24 lg:inset-auto lg:z-auto lg:bg-surface lg:backdrop-blur-none',
        'lg:border lg:rounded-card lg:shadow-sm lg:pb-0',
        className,
      ].join(' ')}
    >
      <div
        className="w-full max-w-content mx-auto px-5 md:px-8 py-4 lg:p-6
                   flex items-center gap-4 lg:flex-col lg:items-stretch"
      >
        {/* Ringkasan tidak boleh terlipat; tombol mengisi sisa lebar (< lg) */}
        {summary && <div className="shrink-0 whitespace-nowrap">{summary}</div>}
        <div className="flex-1 min-w-0 flex gap-3 lg:flex-col [&>*]:flex-1 lg:[&>*]:flex-none lg:[&>*]:w-full">
          {children}
        </div>
      </div>
    </aside>
  );
}
