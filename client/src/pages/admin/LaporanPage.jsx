// pages/admin/LaporanPage.jsx
// AD-08 · Laporan Penjualan (Owner)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function LaporanPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-08"
        title="Laporan Penjualan"
      />
      <PlaceholderPanel step="Step 5.8" refs="FR-33">
        Laporan harian/mingguan/bulanan, ekspor Excel &amp; PDF.
      </PlaceholderPanel>
    </div>
  );
}
