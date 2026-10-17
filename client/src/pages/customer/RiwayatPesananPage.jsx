// pages/customer/RiwayatPesananPage.jsx
// FR-19 · FR-21 · BR-11 · UC-13 · C-17 Riwayat Pesanan (Aktif / Selesai)
// Step 5.4: tab Aktif & Selesai (dengan Dibatalkan), kartu pesanan, Lacak, Pesan Lagi, Beri Ulasan.
// Tab disimpan di URL (?tab=selesai) agar tetap sama saat kembali dari detail pesanan.

import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import ResponsiveGrid from '../../components/layout/ResponsiveGrid';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import OrderHistoryTabs from '../../components/customer/OrderHistoryTabs';
import OrderHistoryCard from '../../components/customer/OrderHistoryCard';
import useServiceQuery from '../../hooks/useServiceQuery';
import useReorder from '../../hooks/useReorder';
import { getMyOrders } from '../../services/orderHistoryService';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { ORDER_HISTORY_TABS, ORDER_HISTORY_TAB } from '../../constants/orderHistory';

export default function RiwayatPesananPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = useServiceQuery(() => getMyOrders(), []);
  const { toast, showToast, hideToast } = useToast();
  const { reorder, pendingOrder } = useReorder(showToast);

  const tab = ORDER_HISTORY_TABS.find((t) => t.key === params.get('tab')) ?? ORDER_HISTORY_TABS[0];
  const orders = query.data ?? [];
  const counts = Object.fromEntries(ORDER_HISTORY_TABS.map((t) => [t.key, orders.filter((o) => t.statuses.includes(o.order_status)).length]));
  const visible = orders.filter((o) => tab.statuses.includes(o.order_status));
  const setTab = (key) => setParams(key === ORDER_HISTORY_TAB.AKTIF ? {} : { tab: key }, { replace: true });

  let body;
  if (query.error) {
    body = <ErrorState message={query.error.message} onRetry={query.reload} />;
  } else if (!query.data) {
    body = (
      <ResponsiveGrid cols={{ base: 1, lg: 2 }} aria-busy="true" aria-label="Memuat pesanan">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="block" className="h-44 w-full rounded-card" />)}
      </ResponsiveGrid>
    );
  } else if (visible.length === 0) {
    body = (
      <div className="card">
        <EmptyState
          icon={<ClipboardList size={36} aria-hidden="true" />}
          title={tab.emptyTitle}
          description={tab.emptyDescription}
          actionLabel="Mulai Belanja"
          onAction={() => navigate(CUSTOMER_ROUTES.KATALOG)}
        />
      </div>
    );
  } else {
    body = (
      <ResponsiveGrid as="ul" cols={{ base: 1, lg: 2 }} aria-label={`Pesanan ${tab.label}`}>
        {visible.map((order) => (
          <OrderHistoryCard
            key={order.order_number}
            order={order}
            onReorder={reorder}
            reordering={pendingOrder === order.order_number}
          />
        ))}
      </ResponsiveGrid>
    );
  }

  return (
    <PageContainer className="py-6 lg:py-10 space-y-5 lg:space-y-6">
      <PageHeader title="Pesanan Saya" />
      <OrderHistoryTabs value={tab.key} counts={query.data ? counts : {}} onChange={setTab} />
      <div role="tabpanel" id={`panel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>{body}</div>
      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
