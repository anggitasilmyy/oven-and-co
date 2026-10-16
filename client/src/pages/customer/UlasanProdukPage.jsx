// pages/customer/UlasanProdukPage.jsx
// C-10 · Ulasan Produk
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function UlasanProdukPage() {
  const { id } = useParams();

  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader
        screenCode="C-10"
        title="Ulasan Produk"
        description={<>ID produk: <code className="font-mono">{id}</code></>}
      />
      <PlaceholderPanel step="Step 5.1" refs="FR-09">
        Ringkasan rating, daftar ulasan (bintang, komentar, foto, tag).
      </PlaceholderPanel>
    </PageContainer>
  );
}
