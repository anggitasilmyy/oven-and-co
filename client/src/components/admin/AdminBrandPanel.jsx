// components/admin/AdminBrandPanel.jsx
// FR-26 · AD-01 Login Admin — panel kiri branding (split screen, hanya desktop)

import { ChefHat } from 'lucide-react';

export default function AdminBrandPanel() {
  return (
    <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-14 relative overflow-hidden">
      {/* Dekorasi lingkaran */}
      <div className="absolute top-[-80px] left-[-80px] w-[320px] h-[320px] rounded-full bg-white/5" />
      <div className="absolute bottom-[-60px] right-[-60px] w-[240px] h-[240px] rounded-full bg-white/5" />

      <div className="relative z-10 text-center text-cream space-y-5">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-primary/80 flex items-center justify-center mx-auto shadow-lg">
          <ChefHat size={40} className="text-cream" />
        </div>
        <h1 className="font-display text-5xl leading-tight">
          Oven &amp; Co.
        </h1>
        <p className="text-cream/60 italic text-lg">Freshly Baked, Made With Care</p>

        {/* Info akun demo */}
        <div className="mt-10 text-left bg-white/10 rounded-2xl p-5 text-sm text-cream/80 space-y-2 max-w-xs">
          <p className="font-semibold text-cream mb-1">Akun Demo</p>
          <p>👤 Owner: <span className="font-mono">owner@demo.com</span></p>
          <p>👤 Staf: <span className="font-mono">staf@demo.com</span></p>
          <p className="text-cream/50">Sandi: <span className="font-mono">demo1234</span></p>
        </div>
      </div>
    </div>
  );
}
