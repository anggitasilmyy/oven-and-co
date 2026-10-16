// pages/customer/BerandaPage.jsx
// C-05 · Beranda
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function BerandaPage() {
  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-05"
        title="Beranda"
      />
      <PlaceholderPanel step="Step 4" refs="FR-05">
        Sapaan, kartu poin, promo, kategori, Fresh from Oven Today, Best Sellers, banner Custom Cake.
      </PlaceholderPanel>
    </PageContainer>
  );
}
