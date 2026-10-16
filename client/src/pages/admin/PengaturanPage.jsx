// pages/admin/PengaturanPage.jsx
// AD-11 · Pengaturan Operasional & Akun Staf (Owner)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PengaturanPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-11"
        title="Pengaturan"
      />
      <PlaceholderPanel step="Step 5.8" refs="FR-36">
        Info toko, jam operasional, ongkir, radius, timeout bayar, kelola akun staf.
      </PlaceholderPanel>
    </div>
  );
}
