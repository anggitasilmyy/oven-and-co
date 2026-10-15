// pages/customer/KatalogPage.jsx
// C-06 · Katalog + C-07 Filter (BottomSheet)
// Step 2 · Placeholder
// C-07 dibuat sebagai BottomSheet di dalam halaman ini, bukan halaman terpisah

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import BottomSheet from '../../components/ui/BottomSheet';

export default function KatalogPage() {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="px-5 py-6 space-y-4">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-06 + C-07</p>
      <h1 className="font-display text-3xl text-cocoa">Katalog</h1>
      <p className="text-sm text-cocoa/60">
        Filter &amp; urutan, grid produk, badge ketersediaan
      </p>

      {/* Tombol Filter — membuka C-07 BottomSheet */}
      <button
        onClick={() => setFilterOpen(true)}
        className="btn-secondary inline-flex items-center gap-2 px-4 h-10 text-sm"
      >
        <SlidersHorizontal size={16} />
        Filter &amp; Urutan
      </button>

      {/* C-07 — Filter BottomSheet */}
      <BottomSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter &amp; Urutan"
      >
        <div className="space-y-3">
          <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-07</p>
          <p className="text-sm text-cocoa/60">
            Filter kategori, ketersediaan, harga, urutan
          </p>
          <p className="text-xs text-cocoa/40">(Konten filter diimplementasi di Step 5.1)</p>
        </div>
      </BottomSheet>
    </div>
  );
}
