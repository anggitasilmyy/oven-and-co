// pages/customer/KeranjangPage.jsx
// C-12 · Keranjang
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function KeranjangPage() {
  return (
    <FocusPageGrid
      aside={
        <ActionBar label="Ringkasan & aksi">
          <PlaceholderPanel step="Step 5.3" compact>
            Ringkasan total dan tombol Checkout.
          </PlaceholderPanel>
        </ActionBar>
      }
    >
      <div className="space-y-6">
        <PageHeader
          screenCode="C-12"
          title="Keranjang"
        />
        <PlaceholderPanel step="Step 5.3" refs="FR-11 · BR-04">
          Daftar item, ubah jumlah, hapus item.
        </PlaceholderPanel>
      </div>
    </FocusPageGrid>
  );
}
