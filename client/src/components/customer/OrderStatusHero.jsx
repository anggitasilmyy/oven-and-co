// components/customer/OrderStatusHero.jsx
// Step 5.4 · FR-17 · C-18 — kartu status saat ini + estimasi waktu siap (PRD Batch 5)

import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, ChefHat, PackageCheck, Truck, BadgeCheck, XCircle } from 'lucide-react';
import Button from '../ui/Button';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { ORDER_STATUS, ORDER_STATUS_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { ORDER_STATUS_HERO_TEXT } from '../../constants/orderHistory';

const ICONS = {
  [ORDER_STATUS.MENUNGGU_PEMBAYARAN]: Clock,
  [ORDER_STATUS.DIKONFIRMASI]: CheckCircle2,
  [ORDER_STATUS.SEDANG_DISIAPKAN]: ChefHat,
  [ORDER_STATUS.SIAP_DIAMBIL]: PackageCheck,
  [ORDER_STATUS.DALAM_PENGIRIMAN]: Truck,
  [ORDER_STATUS.SELESAI]: BadgeCheck,
  [ORDER_STATUS.DIBATALKAN]: XCircle,
};

/** @param {object} order — baris orders */
export default function OrderStatusHero({ order }) {
  const navigate = useNavigate();
  const status = order.order_status;
  const Icon = ICONS[status] ?? Clock;
  const cancelled = status === ORDER_STATUS.DIBATALKAN;
  const settled = cancelled || status === ORDER_STATUS.SELESAI;
  const verb = order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? 'Diantar' : 'Siap diambil';

  return (
    <section aria-label="Status pesanan" className={`card p-5 md:p-6 flex gap-4 ${cancelled ? 'border border-error/30' : ''}`}>
      <div className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center ${cancelled ? 'bg-red-50 text-error' : 'bg-sage/70 text-cocoa'}`}>
        <Icon size={28} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs text-cocoa/65">Status saat ini</p>
        <h2 className={`font-display text-2xl leading-tight ${cancelled ? 'text-error' : 'text-cocoa'}`} aria-live="polite">
          {ORDER_STATUS_LABEL[status]}
        </h2>
        <p className="text-sm text-cocoa/75">{ORDER_STATUS_HERO_TEXT[status]}</p>
        {cancelled && order.cancel_reason && <p className="text-sm text-cocoa/75">Alasan: {order.cancel_reason}</p>}
        {!settled && (
          <p className="text-sm font-semibold text-cocoa">
            {verb} {formatDate(parseDateKey(order.ready_date))} · {order.time_slot}
          </p>
        )}
        {status === ORDER_STATUS.MENUNGGU_PEMBAYARAN && (
          <div className="pt-2">
            <Button size="sm" onClick={() => navigate(buildPath(CUSTOMER_ROUTES.BAYAR, { orderNumber: order.order_number }))}>
              Lanjut Bayar
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
