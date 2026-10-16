// pages/customer/DetailPesananPage.jsx
// C-18 · Detail & Tracking Pesanan
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function DetailPesananPage() {
  const { orderNumber } = useParams();

  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-18"
        title="Detail & Tracking"
        description={<>Pesanan: <code className="font-mono">{orderNumber}</code></>}
      />
      <PlaceholderPanel step="Step 5.4" refs="FR-17 · FR-20 · BR-08">
        Timeline status, detail item, tombol Batalkan (sebelum Sedang Disiapkan), hubungi via WhatsApp.
      </PlaceholderPanel>
    </PageContainer>
  );
}
