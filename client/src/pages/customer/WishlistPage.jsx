// pages/customer/WishlistPage.jsx
// C-23 · Wishlist
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function WishlistPage() {
  return (
    <AccountLayout>
      <div className="space-y-6">
        <PageHeader
          screenCode="C-23"
          title="Wishlist"
        />
        <PlaceholderPanel step="Step 5.5" refs="FR-25">
          Produk yang disimpan pelanggan, toggle wishlist.
        </PlaceholderPanel>
      </div>
    </AccountLayout>
  );
}
