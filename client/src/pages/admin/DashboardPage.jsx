// pages/admin/DashboardPage.jsx
// AD-02 · Dashboard (Owner)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-02"
        title="Dashboard"
      />
      <PlaceholderPanel step="Step 4" refs="FR-27">
        KPI cards, grafik 7 hari (Recharts), pesanan per status, pesanan terbaru, produk terlaris, stok menipis.
      </PlaceholderPanel>
    </div>
  );
}
