// pages/admin/DetailPesananAdminPage.jsx
// FR-28 · UC-20 · UC-21 · AD-04 Detail & Verifikasi Pesanan (Staf & Owner)
// Step 5.6: header nomor & status + tombol Ubah Status dan Cetak Struk, kartu pelanggan, info pickup/delivery dengan
// verifikasi kode pickup, item & spesifikasi custom cake, pembayaran (Tandai Lunas), log status.
// Layout: satu kolom < lg; ≥ lg kolom kanan berisi pelanggan, pickup/delivery, dan pembayaran.

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardX, Printer, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import Toast, { useToast } from '../../components/ui/Toast';
import OrderCustomerCard from '../../components/admin/OrderCustomerCard';
import OrderFulfillmentInfo from '../../components/admin/OrderFulfillmentInfo';
import AdminOrderItems from '../../components/admin/AdminOrderItems';
import OrderPaymentCard from '../../components/admin/OrderPaymentCard';
import OrderStatusLog from '../../components/admin/OrderStatusLog';
import OrderReceipt from '../../components/admin/OrderReceipt';
import StatusChangeModal from '../../components/admin/StatusChangeModal';
import MarkPaidModal from '../../components/admin/MarkPaidModal';
import useServiceQuery from '../../hooks/useServiceQuery';
import useAdminOrderActions from '../../hooks/useAdminOrderActions';
import { getAdminOrderDetail } from '../../services/adminOrderService';
import { ADMIN_ROUTES } from '../../constants/routes';
import { ADMIN_ORDER_ERROR, ADMIN_STATUS_ACTION } from '../../constants/adminOrder';
import { formatDate, formatTime } from '../../utils/format';

const BACK_LINK = 'inline-flex items-center gap-1.5 h-11 text-sm font-semibold text-primary hover:underline underline-offset-2 print:hidden';

export default function DetailPesananAdminPage() {
  const { orderNumber } = useParams();
  const query = useServiceQuery(() => getAdminOrderDetail(orderNumber), [orderNumber]);
  const { toast, showToast, hideToast } = useToast();
  const data = query.data?.order.order_number === orderNumber ? query.data : null;
  const act = useAdminOrderActions(orderNumber, data, { reload: query.reload, showToast });
  const back = <Link to={ADMIN_ROUTES.PESANAN} className={BACK_LINK}><ArrowLeft size={16} aria-hidden="true" /> Daftar Pesanan</Link>;

  if (query.error && !data) {
    // Mode API: HTTP 404 · mode mock: pesan ADMIN_ORDER_ERROR.NOT_FOUND (error mock tidak punya status)
    const notFound = query.error.status === 404 || query.error.message === ADMIN_ORDER_ERROR.NOT_FOUND;
    return (
      <div className="space-y-4">
        {back}
        {notFound ? (
          <div className="card-admin">
            <EmptyState icon={<ClipboardX size={32} aria-hidden="true" />} title="Pesanan tidak ditemukan" description={`Tidak ada pesanan dengan nomor ${orderNumber}.`} />
          </div>
        ) : <ErrorState message={query.error.message} onRetry={query.reload} />}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Memuat pesanan">
        <Skeleton count={2} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton variant="block" className="h-72 w-full rounded-card-admin" />
          <Skeleton variant="block" className="h-72 w-full rounded-card-admin" />
        </div>
      </div>
    );
  }

  const { order, actions } = data;
  const nextLabel = actions.next_status ? ADMIN_STATUS_ACTION[actions.next_status].label : null;

  return (
    <>
      <div className="space-y-5 md:space-y-6 print:hidden">
        {back}
        <PageHeader
          screenCode="AD-04"
          title={order.order_number}
          description={<>Dipesan {formatDate(order.created_at)}, {formatTime(order.created_at)} · <StatusBadge status={order.order_status} /></>}
          actions={(
            <>
              <Button variant="secondary" size="sm" leftIcon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Cetak Struk</Button>
              {nextLabel && (
                <Button size="sm" leftIcon={<RefreshCw size={16} aria-hidden="true" />} disabled={!act.canChangeStatus} onClick={act.openStatusModal} aria-describedby={act.statusBlockedReason ? 'status-blocked-reason' : undefined}>
                  Ubah Status: {nextLabel}
                </Button>
              )}
            </>
          )}
        />
        {act.statusBlockedReason && (
          <p id="status-blocked-reason" role="status" className="rounded-btn bg-peach/40 px-4 py-3 text-sm text-cocoa">{act.statusBlockedReason}</p>
        )}

        <div className="grid gap-5 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0 space-y-5 lg:space-y-6">
            <AdminOrderItems items={data.items} />
            <OrderStatusLog log={data.status_log} />
          </div>
          <div className="min-w-0 space-y-5 lg:space-y-6 lg:row-start-1 lg:col-start-2">
            <OrderCustomerCard customer={data.customer} />
            <OrderFulfillmentInfo
              order={order}
              showVerifier={actions.requires_pickup_code}
              verifier={{ onVerify: act.verify, verifiedCode: act.verifiedCode, onReset: act.resetVerified }}
            />
            <OrderPaymentCard order={order} payment={data.payment} canMarkPaid={actions.can_mark_paid} onMarkPaid={act.openPaidModal} />
          </div>
        </div>
      </div>

      <OrderReceipt detail={data} />

      {act.modal?.type === 'status' && (
        <StatusChangeModal orderNumber={order.order_number} from={act.modal.from} to={act.modal.to} requiresCourier={act.modal.requiresCourier} onConfirm={act.changeStatus} onClose={act.closeModal} />
      )}
      {act.modal?.type === 'paid' && (
        <MarkPaidModal orderNumber={order.order_number} total={order.total} onConfirm={act.markPaid} onClose={act.closeModal} />
      )}
      <Toast {...toast} onClose={hideToast} />
    </>
  );
}
