// pages/customer/FormUlasanPage.jsx
// C-19 · Form Ulasan Produk
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function FormUlasanPage() {
  const { orderNumber } = useParams();

  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-19"
        title="Beri Ulasan"
        description={<>Pesanan: <code className="font-mono">{orderNumber}</code></>}
      />
      <PlaceholderPanel step="Step 5.4" refs="FR-21 · BR-11">
        Rating bintang 1–5, tag, komentar, upload maks. 3 foto, +20 poin.
      </PlaceholderPanel>
    </PageContainer>
  );
}
