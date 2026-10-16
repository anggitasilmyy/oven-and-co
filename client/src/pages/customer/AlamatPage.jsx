// pages/customer/AlamatPage.jsx
// C-22 · Alamat Tersimpan
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function AlamatPage() {
  return (
    <AccountLayout>
      <div className="space-y-6">
        <PageHeader
          screenCode="C-22"
          title="Alamat Tersimpan"
        />
        <PlaceholderPanel step="Step 5.5" refs="FR-24">
          Daftar alamat, tambah/ubah/hapus, atur sebagai utama.
        </PlaceholderPanel>
      </div>
    </AccountLayout>
  );
}
