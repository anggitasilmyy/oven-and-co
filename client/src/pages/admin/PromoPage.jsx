// pages/admin/PromoPage.jsx
// AD-09 · Promo & Loyalty (Owner)
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function PromoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-09"
        title="Promo & Loyalty"
      />
      <PlaceholderPanel step="Step 5.8" refs="FR-34">
        Kelola voucher, aturan poin &amp; level member.
      </PlaceholderPanel>
    </div>
  );
}
