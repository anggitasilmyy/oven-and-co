// pages/customer/BayarPage.jsx
// FR-14 · BR-06 · UC-09 · C-15 Halaman Bayar (timer 30 menit)
// Step 5.3: hitung mundur, QR/VA/kode bayar simulasi, cara bayar, Cek Status Pembayaran, Ganti Metode.
// Lunas → Pesanan Berhasil (C-16). Waktu habis → dibatalkan otomatis + "Belanja Lagi".

import { useCallback, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { TimerOff } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import PaymentPending from '../../components/customer/PaymentPending';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getOrderPayment, simulatePaymentPaid } from '../../services/orderService';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { ORDER_STATUS } from '../../constants/orderStatus';

export default function BayarPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const query = useServiceQuery(() => getOrderPayment(orderNumber), [orderNumber]);
  const { toast, showToast, hideToast } = useToast();
  const [checking, setChecking] = useState(false);
  const successPath = buildPath(CUSTOMER_ROUTES.PESANAN_BERHASIL, { orderNumber });
  const { reload } = query;

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const latest = await getOrderPayment(orderNumber);
      if (latest.order.order_status === ORDER_STATUS.MENUNGGU_PEMBAYARAN) showToast('info', 'Pembayaran belum diterima');
      reload();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setChecking(false);
    }
  }, [orderNumber, reload, showToast]);

  const simulatePaid = async () => {
    try {
      await simulatePaymentPaid(orderNumber);
      navigate(successPath, { replace: true });
    } catch (e) {
      showToast('error', e.message);
    }
  };

  let body;
  const data = query.data;
  if (query.error) {
    body = <div className="page-container py-6"><ErrorState message={query.error.message} onRetry={reload} /></div>;
  } else if (!data || data.order.order_number !== orderNumber) {
    body = <div className="page-container py-6 space-y-4" aria-busy="true" aria-label="Memuat pembayaran"><Skeleton count={2} /><Skeleton variant="block" className="h-72 w-full rounded-card" /></div>;
  } else if (data.order.order_status === ORDER_STATUS.DIBATALKAN) {
    body = (
      <div className="page-container py-10">
        <div className="card">
          <EmptyState
            icon={<TimerOff size={36} aria-hidden="true" />}
            title="Waktu pembayaran habis, pesanan dibatalkan otomatis"
            description={`Pesanan ${orderNumber} dibatalkan karena belum dibayar dalam 30 menit.`}
            actionLabel="Belanja Lagi"
            onAction={() => navigate(CUSTOMER_ROUTES.KATALOG)}
          />
        </div>
      </div>
    );
  } else if (data.order.order_status !== ORDER_STATUS.MENUNGGU_PEMBAYARAN) {
    body = <Navigate to={successPath} replace />;
  } else {
    body = (
      <PaymentPending
        data={data}
        onCheck={check}
        checking={checking}
        onExpire={reload}
        onSimulatePaid={import.meta.env.DEV ? simulatePaid : null}
        notify={showToast}
      />
    );
  }

  return (
    <>
      {body}
      <Toast {...toast} onClose={hideToast} />
    </>
  );
}
