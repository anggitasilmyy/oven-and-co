// pages/customer/AkunPage.jsx
// C-20 · Akun (profil, poin, menu sub-akun)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function AkunPage() {
  return (
    <AccountLayout>
      <div className="space-y-6">
        <PageHeader
          screenCode="C-20"
          title="Akun"
        />
        <PlaceholderPanel step="Step 5.5" refs="FR-22 · FR-24">
          Foto profil, nama, level member (Silver/Gold/Platinum), saldo poin, menu: Ubah Profil, Voucher &amp; Poin, Alamat, Wishlist, Keluar.
        </PlaceholderPanel>
      </div>
    </AccountLayout>
  );
}
