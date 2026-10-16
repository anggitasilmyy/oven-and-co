// pages/admin/KalenderPage.jsx
// AD-05 · Kalender Produksi
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function KalenderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-05"
        title="Kalender Produksi"
      />
      <PlaceholderPanel step="Step 5.6" refs="FR-29">
        Kalender harian pre-order &amp; custom cake yang perlu disiapkan.
      </PlaceholderPanel>
    </div>
  );
}
