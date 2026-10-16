// pages/customer/PesananBerhasilPage.jsx
// C-16 · Pesanan Berhasil
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PesananBerhasilPage() {
  const { orderNumber } = useParams();

  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-16"
        title="Pesanan Berhasil"
        description={<>Nomor pesanan: <code className="font-mono">{orderNumber}</code></>}
      />
      <PlaceholderPanel step="Step 5.3" refs="FR-16">
        Konfirmasi, nomor pesanan, kode pickup (jika Bayar di Toko), ringkasan, link ke Riwayat.
      </PlaceholderPanel>
    </PageContainer>
  );
}
