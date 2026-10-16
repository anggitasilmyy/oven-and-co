// layouts/FocusLayout.jsx
// Step 2 · Layout & Komponen Dasar — Step 2.5 (PR A): responsive (CR-01)
// Dipakai untuk: C-09 Detail Produk, C-11 Custom Cake, C-12 Keranjang,
//               C-13 Checkout, C-14 Metode Bayar, C-15 Halaman Bayar,
//               layar auth, dan layar sub-akun
//
// Header kembali selalu ada; tanpa bottom nav / top nav.
// Halaman merangkai kontennya dengan <FocusPageGrid aside={<ActionBar/>}>:
//   < lg : ActionBar fixed di bawah · ≥ lg : kartu sticky di kolom kanan.
// Prop `bottomBar` (dipakai bila FocusLayout membungkus children langsung) dirender sebagai ActionBar.

import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '../components/layout/BrandLogo';
import ActionBar from '../components/layout/ActionBar';

/**
 * @param {string} title — judul opsional di header
 * @param {Function} onBack — override handler tombol kembali
 * @param {React.ReactNode} headerRight — slot kanan header
 * @param {React.ReactNode} bottomBar — isi ActionBar (opsional)
 */
export default function FocusLayout({ title, onBack, headerRight, bottomBar, children }) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(-1));

  // FocusLayout bisa dipakai sebagai wrapper langsung (children) ATAU via <Outlet/>
  const content = children ?? <Outlet />;

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* ── Header kembali ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-beige">
        <div className="page-container h-14 md:h-16 flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-full shrink-0
                       text-cocoa hover:bg-beige active:scale-95 transition
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Kembali"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          {/* Logo hanya ≥ md (di HP ruang header dipakai untuk judul) */}
          <BrandLogo className={title ? 'hidden md:inline-flex' : ''} />

          {title && (
            <h1 className="flex-1 min-w-0 font-sans font-semibold text-base text-cocoa truncate md:border-l md:border-beige md:pl-4">
              {title}
            </h1>
          )}

          {headerRight && <div className="ml-auto flex items-center gap-1">{headerRight}</div>}
        </div>
      </header>

      {/* ── Konten ──────────────────────────────────────────────────────────── */}
      {/* Tanpa overflow-y-auto agar position: sticky (ActionBar ≥ lg) bekerja terhadap viewport.
          Lebar & padding diatur halaman lewat PageContainer / FocusPageGrid / AuthSplitLayout
          (AuthSplitLayout butuh lebar penuh untuk panel brand). */}
      <main className={`flex-1 flex flex-col w-full ${bottomBar ? 'pb-36 lg:pb-6' : ''}`}>
        {content}
        {bottomBar && (
          <div className="page-container lg:max-w-sm lg:ml-auto lg:mr-0">
            <ActionBar>{bottomBar}</ActionBar>
          </div>
        )}
      </main>
    </div>
  );
}
