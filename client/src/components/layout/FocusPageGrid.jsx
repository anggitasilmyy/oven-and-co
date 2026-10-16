// components/layout/FocusPageGrid.jsx
// Step 2.5 (PR A) · SPEC §7 alur fokus (Detail, Builder, Keranjang, Checkout, Pembayaran, Bayar)
// < lg : satu kolom; panel aksi (ActionBar) menempel di bawah layar
// ≥ lg : dua kolom — konten kiri, panel aksi berupa kartu sticky di kolom kanan

/**
 * @param {React.ReactNode} children — konten utama (kolom kiri)
 * @param {React.ReactNode} aside — biasanya <ActionBar>…</ActionBar>; boleh kosong
 * @param {'md'|'lg'} asideWidth — lebar kolom kanan di desktop
 */
export default function FocusPageGrid({ children, aside, asideWidth = 'md', className = '' }) {
  const columns =
    asideWidth === 'lg'
      ? 'lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]'
      : 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]';

  return (
    <div
      className={[
        'page-container py-6 lg:py-10',
        aside ? `lg:grid ${columns} lg:gap-8 xl:gap-10 lg:items-start` : '',
        // Ruang agar konten tidak tertutup ActionBar fixed di < lg
        aside ? 'pb-36 lg:pb-10' : '',
        className,
      ].join(' ')}
    >
      <div className="min-w-0">{children}</div>
      {aside}
    </div>
  );
}
