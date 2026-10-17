// pages/customer/DetailPesananPage.jsx
// FR-17 · FR-19 · FR-20 · BR-07 · BR-08 · UC-11 · UC-12 · C-18 Detail & Tracking Pesanan
// Step 5.4: kartu status + estimasi, stepper status dengan waktu (order_status_histories), kartu pickup/delivery,
// item, ringkasan pembayaran, Hubungi Oven & Co. (WhatsApp), Batalkan (sebelum Sedang Disiapkan), Pesan Lagi,
// Beri Ulasan. Data dimuat ulang berkala selama pesanan aktif (pengganti status real time).
// Layout: satu kolom di < lg; ≥ lg kolom kanan sticky berisi pickup/delivery, pembayaran, dan aksi.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import CostSummary from '../../components/customer/CostSummary';
import OrderStatusHero from '../../components/customer/OrderStatusHero';
import OrderTimeline from '../../components/customer/OrderTimeline';
import OrderFulfillmentCard from '../../components/customer/OrderFulfillmentCard';
import OrderItemList from '../../components/customer/OrderItemList';
import OrderActionsCard from '../../components/customer/OrderActionsCard';
import CancelOrderModal from '../../components/customer/CancelOrderModal';
import useServiceQuery from '../../hooks/useServiceQuery';
import useReorder from '../../hooks/useReorder';
import { getMyOrderDetail, cancelMyOrder } from '../../services/orderHistoryService';
import { formatDate, formatTime } from '../../utils/format';
import { ORDER_STATUS, PAYMENT_OPTION, PAYMENT_STATUS, PAYMENT_STATUS_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { PAY_AT_STORE_LABEL } from '../../constants/checkout';
import { TRACKING_REFRESH_MS } from '../../constants/orderHistory';

/** Baris ringkasan biaya dari salinan nilai pesanan */
function costRows(order) {
  return [
    { label: 'Subtotal', amount: order.subtotal },
    ...(order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? [{ label: `Ongkir (${String(order.distance_km ?? 0).replace('.', ',')} km)`, amount: order.shipping_fee }] : []),
    ...(order.voucher_discount > 0 ? [{ label: 'Diskon voucher', amount: order.voucher_discount, discount: true }] : []),
    ...(order.points_discount > 0 ? [{ label: `Tukar ${order.points_used} poin`, amount: order.points_discount, discount: true }] : []),
  ];
}

export default function DetailPesananPage() {
  const { orderNumber } = useParams();
  const query = useServiceQuery(() => getMyOrderDetail(orderNumber), [orderNumber]);
  const { toast, showToast, hideToast } = useToast();
  const { reorder, pendingOrder } = useReorder(showToast);
  const [cancelOpen, setCancelOpen] = useState(false);
  const data = query.data?.order.order_number === orderNumber ? query.data : null;
  const status = data?.order.order_status;
  const { reload } = query;

  // Status diperbarui berkala selama pesanan belum Selesai/Dibatalkan (perubahan dari admin, Step 5.6)
  useEffect(() => {
    if (!status || status === ORDER_STATUS.SELESAI || status === ORDER_STATUS.DIBATALKAN) return undefined;
    const timer = setInterval(reload, TRACKING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status, reload]);

  const confirmCancel = async (reason) => {
    await cancelMyOrder(orderNumber, reason);
    setCancelOpen(false);
    showToast('success', 'Pesanan berhasil dibatalkan');
    reload();
  };

  if (query.error && !data) {
    return <PageContainer className="py-6"><ErrorState message={query.error.message} onRetry={reload} /></PageContainer>;
  }
  if (!data) {
    return (
      <PageContainer className="py-6 lg:py-10 space-y-4" aria-busy="true" aria-label="Memuat pesanan">
        <Skeleton count={2} />
        <Skeleton variant="block" className="h-36 w-full rounded-card" />
        <Skeleton variant="block" className="h-64 w-full rounded-card" />
      </PageContainer>
    );
  }

  const { order } = data;
  const paymentLabel = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE && order.payment_status === PAYMENT_STATUS.UNPAID
    ? PAY_AT_STORE_LABEL : PAYMENT_STATUS_LABEL[order.payment_status];

  return (
    <PageContainer className="py-6 lg:py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:items-start">
      <div className="min-w-0 space-y-5 lg:space-y-6">
        <PageHeader
          title="Detail Pesanan"
          description={<><span className="font-mono font-semibold text-cocoa">{order.order_number}</span> · Dipesan {formatDate(order.created_at)}, {formatTime(order.created_at)}</>}
        />
        <OrderStatusHero order={order} />
        <OrderTimeline steps={data.steps} />
        <OrderItemList items={data.items} showReviewed={status === ORDER_STATUS.SELESAI} />
      </div>
      <div className="min-w-0 space-y-5 mt-5 lg:mt-0 lg:sticky lg:top-24">
        <OrderFulfillmentCard order={order} storeAddress={data.store.address} payBeforeTime={data.pay_before_time} />
        <CostSummary
          title="Ringkasan pembayaran"
          rows={costRows(order)}
          total={order.total}
          note={`Metode: ${data.method_name ?? '-'} · ${paymentLabel}`}
        />
        <OrderActionsCard detail={data} onCancel={() => setCancelOpen(true)} onReorder={reorder} reordering={pendingOrder === orderNumber} />
      </div>
      {cancelOpen && <CancelOrderModal isOpen onClose={() => setCancelOpen(false)} order={order} onConfirm={confirmCancel} />}
      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
