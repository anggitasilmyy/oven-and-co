// pages/admin/DetailPesananAdminPage.jsx
// AD-04 · Detail & Verifikasi Pesanan
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function DetailPesananAdminPage() {
  const { orderNumber } = useParams();

  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-04"
        title="Detail Pesanan"
        description={<>Pesanan: <code className="font-mono">{orderNumber}</code></>}
      />
      <PlaceholderPanel step="Step 5.6" refs="FR-28">
        Ubah status, verifikasi kode pickup, tandai lunas, cetak struk.
      </PlaceholderPanel>
    </div>
  );
}
