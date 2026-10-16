// components/layout/AuthSplitLayout.jsx
// Step 2.5 (PR A) · NFR-06 (CR-01) — generalisasi AdminBrandPanel (AD-01)
// ≥ lg : panel brand di kiri + form di kanan
// < lg : form saja, dengan logo ringkas di atasnya (bisa dimatikan bila header layout sudah berlogo)
// Step 2.5 (PR B): dipakai C-02 – C-04 (di dalam FocusLayout) dan AD-01

import { ChefHat } from 'lucide-react';

/**
 * @param {string} subtitle — teks kecil di bawah nama toko (mis. "Admin Panel")
 * @param {React.ReactNode} brandExtra — konten tambahan di panel brand (mis. info akun demo)
 * @param {boolean} showMobileBrand — tampilkan logo ringkas di atas form (< lg)
 * @param {React.ReactNode} children — form
 */
export default function AuthSplitLayout({
  subtitle,
  brandExtra,
  showMobileBrand = true,
  className = 'min-h-screen',
  children,
}) {
  return (
    <div className={`flex bg-cream ${className}`}>
      {/* Panel brand — hanya ≥ lg */}
      <div data-layout="auth-brand" className="hidden lg:flex lg:w-[46%] xl:w-1/2 shrink-0 flex-col items-center justify-center p-14 bg-cocoa relative overflow-hidden">
        <div className="absolute top-[-80px] left-[-80px] w-[320px] h-[320px] rounded-full bg-white/5" aria-hidden="true" />
        <div className="absolute bottom-[-60px] right-[-60px] w-[240px] h-[240px] rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative z-10 text-center text-cream space-y-5">
          <div className="w-20 h-20 rounded-2xl bg-primary/80 flex items-center justify-center mx-auto shadow-lg">
            <ChefHat size={40} className="text-cream" aria-hidden="true" />
          </div>
          <p className="font-display text-5xl leading-tight">Oven &amp; Co.</p>
          <p className="text-cream/70 italic text-lg">Freshly Baked, Made With Care</p>
          {brandExtra && <div className="pt-6 flex justify-center">{brandExtra}</div>}
        </div>
      </div>

      {/* Panel form */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-5 py-8 md:px-8 md:py-12 lg:px-12">
        <div className="w-full max-w-auth">
          {/* Logo ringkas — hanya < lg */}
          {showMobileBrand && (
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <ChefHat size={22} className="text-cream" aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-xl text-cocoa leading-tight">Oven &amp; Co.</p>
                {subtitle && <p className="text-xs text-cocoa/60">{subtitle}</p>}
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
