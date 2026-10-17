// pages/customer/VoucherPoinPage.jsx
// FR-22 · FR-23 · BR-09 · BR-10 · UC-15 · C-21 Voucher & Poin
// Step 5.5: kartu poin & level, tab Voucher (voucher milik pelanggan + tombol Pakai) dan Riwayat Poin,
// info level member. Tab disimpan di URL (?tab=poin). ≥ xl: kartu poin & level menjadi kolom kanan.

import { useSearchParams } from 'react-router-dom';
import { Ticket, Coins } from 'lucide-react';
import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import MemberCard from '../../components/customer/MemberCard';
import MemberLevelInfo from '../../components/customer/MemberLevelInfo';
import VoucherCard from '../../components/customer/VoucherCard';
import PointHistoryList from '../../components/customer/PointHistoryList';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMyLoyaltySummary, getMyPointHistory, getMyVouchers } from '../../services/loyaltyService';
import { VOUCHER_POINT_TAB, VOUCHER_POINT_TABS } from '../../constants/account';

const loadingList = (
  <div className="space-y-3" aria-busy="true" aria-label="Memuat">
    {[0, 1, 2].map((i) => <Skeleton key={i} variant="block" className="h-28 w-full rounded-card" />)}
  </div>
);

export default function VoucherPoinPage() {
  const [params, setParams] = useSearchParams();
  const tab = VOUCHER_POINT_TABS.find((t) => t.key === params.get('tab'))?.key ?? VOUCHER_POINT_TAB.VOUCHER;
  const summary = useServiceQuery(() => getMyLoyaltySummary(), []);
  const vouchers = useServiceQuery(() => getMyVouchers(), []);
  const history = useServiceQuery(() => getMyPointHistory(), []);
  const query = tab === VOUCHER_POINT_TAB.VOUCHER ? vouchers : history;

  let body;
  if (query.error) {
    body = <ErrorState message={query.error.message} onRetry={query.reload} />;
  } else if (!query.data) {
    body = loadingList;
  } else if (query.data.length === 0) {
    body = (
      <div className="card">
        {tab === VOUCHER_POINT_TAB.VOUCHER
          ? <EmptyState icon={<Ticket size={36} aria-hidden="true" />} title="Belum ada voucher" description="Voucher yang kamu miliki akan tampil di sini." />
          : <EmptyState icon={<Coins size={36} aria-hidden="true" />} title="Belum ada riwayat poin" description="Poin bertambah setelah pesanan Selesai dan saat memberi ulasan." />}
      </div>
    );
  } else if (tab === VOUCHER_POINT_TAB.VOUCHER) {
    body = <ul className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" aria-label="Voucher saya">{query.data.map((item) => <VoucherCard key={item.voucher.voucher_id} item={item} />)}</ul>;
  } else {
    body = <PointHistoryList items={query.data} />;
  }

  return (
    <AccountLayout>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Voucher & Poin" />
        <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="space-y-5 xl:order-2 md:grid md:grid-cols-2 md:gap-5 md:space-y-0 xl:block xl:space-y-5 xl:sticky xl:top-24">
            <MemberCard summary={summary.data} loading={summary.loading} error={summary.error} onRetry={summary.reload} showRewardLink={false} />
            <MemberLevelInfo currentKey={summary.data?.level.key} />
          </div>
          <div className="space-y-4 min-w-0">
            <Tabs
              tabs={VOUCHER_POINT_TABS}
              value={tab}
              label="Voucher dan riwayat poin"
              onChange={(key) => setParams(key === VOUCHER_POINT_TAB.VOUCHER ? {} : { tab: key }, { replace: true })}
            />
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{body}</div>
          </div>
        </div>
      </div>
    </AccountLayout>
  );
}
