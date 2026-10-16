// pages/admin/ProdukAdminPage.jsx
// AD-06 · Produk & Opsi Custom Cake
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function ProdukAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-06"
        title="Produk & Custom Cake"
      />
      <PlaceholderPanel step="Step 5.7" refs="FR-30 · FR-31">
        CRUD produk (maks. 5 foto), kelola opsi custom cake per grup.
      </PlaceholderPanel>
    </div>
  );
}
