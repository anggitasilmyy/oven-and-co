// pages/admin/PesananAdminPage.jsx
// AD-03 · Daftar Pesanan (landing Staf)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PesananAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-03"
        title="Daftar Pesanan"
      />
      <PlaceholderPanel step="Step 4" refs="FR-28">
        Tabel pesanan (dibungkus TableScroll), tab status, filter, cari nomor pesanan.
      </PlaceholderPanel>
    </div>
  );
}
