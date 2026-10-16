// pages/customer/KatalogPage.jsx
// C-06 · Katalog + C-07 Filter (BottomSheet)
// C-07 dibuat sebagai BottomSheet di dalam halaman ini, bukan halaman terpisah
// Step 2.5 (PR B): kerangka responsif — < md BottomSheet dari bawah, ≥ md dialog di tengah.
// Sidebar filter desktop baru dibuat bersama konten filter di Step 5.1.

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import BottomSheet from '../../components/ui/BottomSheet';
import Button from '../../components/ui/Button';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function KatalogPage() {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-06 + C-07"
        title="Katalog"
        actions={
          // Tombol Filter — membuka C-07 BottomSheet
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
            onClick={() => setFilterOpen(true)}
          >
            Filter &amp; Urutan
          </Button>
        }
      />

      <PlaceholderPanel step="Step 5.1" refs="FR-06">
        Grid produk (2 kolom di HP, 3 di tablet, 4 di desktop lewat ResponsiveGrid) dengan badge ketersediaan.
      </PlaceholderPanel>

      {/* C-07 — Filter BottomSheet */}
      <BottomSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter &amp; Urutan"
      >
        <div className="space-y-3">
          <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-07</p>
          <PlaceholderPanel step="Step 5.1" refs="FR-06">
            Filter kategori, ketersediaan, harga, urutan.
          </PlaceholderPanel>
        </div>
      </BottomSheet>
    </PageContainer>
  );
}
