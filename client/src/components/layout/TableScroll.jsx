// components/layout/TableScroll.jsx
// Step 2.5 (PR A) · NFR-06 Responsive (CR-01)
// Bungkus tabel admin agar bisa digeser horizontal di layar sempit tanpa membuat halaman overflow.

/**
 * @param {string} label — nama tabel untuk pembaca layar (region bisa difokus & digeser keyboard)
 * @param {string} minWidth — lebar minimum tabel, mis. 'min-w-[720px]'
 */
export default function TableScroll({ label, minWidth = 'min-w-[720px]', className = '', children }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`w-full overflow-x-auto overscroll-x-contain rounded-card-admin
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
    >
      <div className={`${minWidth} [&_td]:tabular-nums`}>{children}</div>
    </div>
  );
}
