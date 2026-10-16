// pages/customer/NotifikasiPage.jsx
// C-24 · Notifikasi
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function NotifikasiPage() {
  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-24"
        title="Notifikasi"
      />
      <PlaceholderPanel step="Step 5.5" refs="FR-18">
        Notifikasi in-app: perubahan status pesanan, promo, poin.
      </PlaceholderPanel>
    </PageContainer>
  );
}
