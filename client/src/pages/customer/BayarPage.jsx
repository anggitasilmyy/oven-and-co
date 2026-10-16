// pages/customer/BayarPage.jsx
// C-15 · Halaman Bayar (timer 30 menit)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import { useParams } from 'react-router-dom';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function BayarPage() {
  const { orderNumber } = useParams();

  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.3" compact>
            Hitung mundur 30 menit, total, dan tombol "Simulasikan Lunas" (dev).
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader
          screenCode="C-15"
          title="Halaman Bayar"
          description={<>Nomor pesanan: <code className="font-mono">{orderNumber}</code></>}
        />
        <PlaceholderPanel step="Step 5.3" refs="FR-14 · BR-06">
          QR/VA/kode bayar dan instruksi pembayaran.
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
