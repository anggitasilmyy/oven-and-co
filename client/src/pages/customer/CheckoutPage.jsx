// pages/customer/CheckoutPage.jsx
// C-13 · Checkout (pickup/delivery, voucher, poin)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function CheckoutPage() {
  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.3" compact>
            Ringkasan biaya dan tombol lanjut ke pembayaran.
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader
          screenCode="C-13"
          title="Checkout"
        />
        <PlaceholderPanel step="Step 5.3" refs="FR-12 · FR-13 · BR-03 · BR-05">
          Pilihan pickup/delivery, alamat, slot waktu, voucher, tukar poin.
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
