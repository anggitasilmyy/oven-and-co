// pages/customer/PembayaranPage.jsx
// C-14 · Metode Pembayaran
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PembayaranPage() {
  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.3" compact>
            Total pembayaran dan tombol Bayar.
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader
          screenCode="C-14"
          title="Metode Pembayaran"
        />
        <PlaceholderPanel step="Step 5.3" refs="FR-14 · FR-15 · BR-05">
          QRIS, e-wallet (GoPay, OVO, Dana, ShopeePay), VA, Bayar di Toko (bersyarat).
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
