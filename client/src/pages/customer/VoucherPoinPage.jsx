// pages/customer/VoucherPoinPage.jsx
// C-21 · Voucher & Poin
// Step 2.5 (PR B): kerangka responsif — konten asli dijadwalkan sesuai ROADMAP

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';

export default function VoucherPoinPage() {
  return (
    <AccountLayout>
      <div className="space-y-6">
        <PageHeader
          screenCode="C-21"
          title="Voucher & Poin"
        />
        <PlaceholderPanel step="Step 5.5" refs="FR-22 · FR-23">
          Saldo poin, riwayat poin, daftar voucher milik pelanggan.
        </PlaceholderPanel>
      </div>
    </AccountLayout>
  );
}
