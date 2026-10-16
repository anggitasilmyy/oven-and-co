// pages/admin/PelangganPage.jsx
// AD-10 · Pelanggan & Ulasan
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PelangganPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-10"
        title="Pelanggan & Ulasan"
      />
      <PlaceholderPanel step="Step 5.8" refs="FR-35">
        Daftar pelanggan, balas ulasan, sembunyikan ulasan.
      </PlaceholderPanel>
    </div>
  );
}
