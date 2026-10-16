// pages/customer/CariPage.jsx
// C-08 · Pencarian
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function CariPage() {
  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-08"
        title="Pencarian"
      />
      <PlaceholderPanel step="Step 5.1" refs="FR-07">
        Cari produk, riwayat pencarian tersimpan di localStorage perangkat.
      </PlaceholderPanel>
    </PageContainer>
  );
}
