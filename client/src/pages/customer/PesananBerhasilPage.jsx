// pages/customer/PesananBerhasilPage.jsx
// FR-16 · F-17 · UC-09 · C-16 Pesanan Berhasil
// Step 5.3: terima kasih, nomor pesanan, info poin (+N poin setelah Selesai, BR-09), ringkasan pemenuhan,
// kode pickup & label "Bayar saat ambil" untuk Bayar di Toko, tombol Lacak Pesanan & Kembali ke Beranda.

import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PackageCheck, Sparkles } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getOrderPayment } from '../../services/orderService';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { ORDER_STATUS, ORDER_STATUS_LABEL, PAYMENT_OPTION, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { PAY_AT_STORE_LABEL } from '../../constants/checkout';

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-cocoa/70">{label}</dt>
      <dd className="font-semibold text-cocoa text-right break-words min-w-0">{children}</dd>
    </div>
  );
}

export default function PesananBerhasilPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const query = useServiceQuery(() => getOrderPayment(orderNumber), [orderNumber]);
  const data = query.data;

  if (query.error) return <div className="page-container py-6"><ErrorState message={query.error.message} onRetry={query.reload} /></div>;
  if (!data || data.order.order_number !== orderNumber) {
    return <PageContainer variant="narrow" className="py-10 space-y-4" aria-busy="true"><Skeleton variant="circle" className="!w-24 !h-24 mx-auto" /><Skeleton count={4} /></PageContainer>;
  }
  const { order } = data;
  if (order.order_status === ORDER_STATUS.MENUNGGU_PEMBAYARAN || order.order_status === ORDER_STATUS.DIBATALKAN) {
    return <Navigate to={buildPath(CUSTOMER_ROUTES.BAYAR, { orderNumber })} replace />;
  }
  const payAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE;
  const isPickup = order.fulfillment_type === FULFILLMENT_TYPE.PICKUP;

  return (
    <PageContainer variant="narrow" className="py-8 lg:py-12">
      <div className="card p-6 md:p-10 text-center space-y-5">
        <div className="mx-auto w-24 h-24 rounded-full bg-sage/70 text-cocoa flex items-center justify-center">
          <PackageCheck size={44} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl md:text-3xl text-cocoa leading-tight">Terima kasih, pesananmu sudah kami terima!</h1>
          <p className="text-sm md:text-base text-cocoa/70">Kami akan menyiapkannya with care.</p>
        </div>
        <div>
          <p className="text-xs text-cocoa/65">Nomor pesanan</p>
          <p className="font-mono text-xl font-bold text-cocoa tracking-wide">{order.order_number}</p>
        </div>
        <p className="inline-flex items-center gap-1.5 rounded-pill bg-peach/70 px-4 py-2 text-sm font-semibold text-cocoa">
          <Sparkles size={16} aria-hidden="true" /> +{data.points_to_earn.toLocaleString('id-ID')} poin akan masuk setelah pesanan selesai
        </p>

        <dl className="text-left divide-y divide-beige border-y border-beige">
          <Row label="Status"><Badge variant="neutral">{ORDER_STATUS_LABEL[order.order_status]}</Badge></Row>
          <Row label={isPickup ? 'Pickup di Toko' : 'Delivery'}>{formatDate(parseDateKey(order.ready_date))} · {order.time_slot}</Row>
          {isPickup && order.pickup_code && <Row label="Kode pickup"><span className="font-mono text-base">{order.pickup_code}</span></Row>}
          {!isPickup && order.delivery_address_snapshot && <Row label="Alamat">{order.delivery_address_snapshot}</Row>}
          <Row label="Pembayaran">{payAtStore ? PAY_AT_STORE_LABEL : `Lunas · ${data.method?.name ?? '-'}`}</Row>
          <Row label="Total">{formatRupiah(order.total)}</Row>
        </dl>
        {payAtStore && <p className="text-xs text-cocoa/70">Tunjukkan kode pickup dan bayar di kasir saat mengambil pesanan.</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Button fullWidth onClick={() => navigate(buildPath(CUSTOMER_ROUTES.DETAIL_PESANAN, { orderNumber }))}>Lacak Pesanan</Button>
          <Button fullWidth variant="secondary" onClick={() => navigate(CUSTOMER_ROUTES.BERANDA)}>Kembali ke Beranda</Button>
        </div>
      </div>
    </PageContainer>
  );
}
