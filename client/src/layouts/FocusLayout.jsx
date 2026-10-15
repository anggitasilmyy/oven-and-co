// layouts/FocusLayout.jsx
// Step 2 · Layout & Komponen Dasar
// Dipakai untuk: C-09 Detail Produk, C-11 Custom Cake, C-12 Keranjang,
//               C-13 Checkout, C-14 Metode Bayar, C-15 Halaman Bayar,
//               dan layar sub-akun

import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Layout fokus: header kembali + konten + sticky bottom bar.
 * Tidak ada bottom nav.
 *
 * Komponen halaman dapat menyuntikkan konten ke sticky bottom bar
 * melalui prop `bottomBar` yang diteruskan oleh FocusLayout via context
 * (implementasi context ada di Step 3+; sekarang slot kosong).
 *
 * @param {string} title — judul opsional di header
 * @param {Function} onBack — override handler tombol kembali
 * @param {React.ReactNode} headerRight — slot kanan header
 * @param {React.ReactNode} bottomBar — slot sticky bottom bar
 */
export default function FocusLayout({ title, onBack, headerRight, bottomBar, children }) {
  const navigate = useNavigate();

  const handleBack = onBack ?? (() => navigate(-1));

  // FocusLayout bisa dipakai sebagai wrapper langsung (children) ATAU via <Outlet/>
  const content = children ?? <Outlet />;

  return (
    <div className="min-h-screen bg-cream flex justify-center">
      <div className="w-full max-w-[480px] flex flex-col min-h-screen bg-cream">

        {/* ── Header kembali ────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-beige px-4 h-14 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-beige transition-colors shrink-0"
            aria-label="Kembali"
          >
            <ArrowLeft size={20} className="text-cocoa" />
          </button>

          {title && (
            <h1 className="flex-1 font-sans font-semibold text-base text-cocoa truncate">
              {title}
            </h1>
          )}

          {/* Slot kanan — ikon wishlist, share, dll */}
          {headerRight && (
            <div className="ml-auto flex items-center gap-1">{headerRight}</div>
          )}
        </header>

        {/* ── Konten ────────────────────────────────────────────────────────── */}
        <main className={`flex-1 overflow-y-auto ${bottomBar ? 'pb-[88px]' : 'pb-6'}`}>
          {content}
        </main>

        {/* ── Sticky Bottom Bar (slot tombol aksi) ──────────────────────────── */}
        {bottomBar && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-30
                          bg-surface/95 backdrop-blur-sm border-t border-beige px-5 py-4">
            {bottomBar}
          </div>
        )}
      </div>
    </div>
  );
}
