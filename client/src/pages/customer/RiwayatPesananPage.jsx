// pages/customer/RiwayatPesananPage.jsx
// C-17 · Riwayat Pesanan (Aktif / Selesai)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function RiwayatPesananPage() {
  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-17"
        title="Riwayat Pesanan"
      />
      <PlaceholderPanel step="Step 5.4" refs="FR-19">
        Tab Aktif &amp; Selesai/Dibatalkan, kartu pesanan, tombol Pesan Lagi.
      </PlaceholderPanel>
    </PageContainer>
  );
}
