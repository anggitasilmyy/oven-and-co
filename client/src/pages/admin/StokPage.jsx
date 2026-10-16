// pages/admin/StokPage.jsx
// AD-07 · Stok Harian & Bahan Baku
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function StokPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-07"
        title="Stok"
      />
      <PlaceholderPanel step="Step 5.7" refs="FR-32">
        Stok harian produk (qty_planned, qty_sold), bahan baku + peringatan stok minimum.
      </PlaceholderPanel>
    </div>
  );
}
