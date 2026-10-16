// pages/customer/UbahProfilPage.jsx
// C-20 (sub) · Ubah Profil — rute /akun/ubah-profil
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function UbahProfilPage() {
  return (
    <AccountLayout>
      <div className="space-y-6">
        <PageHeader
          screenCode="C-20 / Sub"
          title="Ubah Profil"
        />
        <PlaceholderPanel step="Step 5.5" refs="FR-24">
          Edit nama, email, nomor HP, foto profil.
        </PlaceholderPanel>
      </div>
    </AccountLayout>
  );
}
