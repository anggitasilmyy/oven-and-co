// components/admin/OrderCardList.jsx
// Step 4 · AD-02 & AD-03 — daftar pesanan versi kartu untuk layar < 768 px

import { Link } from 'react-router-dom';
import { ChevronRight, Store, Truck } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';
import { orderDetailPath } from './orderColumns';
import { FULFILLMENT_LABEL, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { formatRupiah, formatDate, formatTime } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

/** @param {Array} rows — baris pesanan dari adminOrderService/dashboardService */
export default function OrderCardList({ rows, showPayment = true }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const FulfillmentIcon = r.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? Truck : Store;
        return (
          <li key={r.order_id}>
            <Link
              to={orderDetailPath(r.order_number)}
              className="block card-admin p-4 space-y-3 transition hover:shadow-md active:scale-[0.99]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={`Pesanan ${r.order_number}, ${r.customer_name}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-cocoa text-sm">{r.order_number}</p>
                  <p className="text-xs text-cocoa/70">{formatDate(r.created_at)} · {formatTime(r.created_at)}</p>
                </div>
                <StatusBadge status={r.order_status} />
              </div>
              <div className="text-sm text-cocoa space-y-1">
                <p className="font-medium truncate">{r.customer_name}</p>
                <p className="text-xs text-cocoa/70 truncate">{r.items_summary}</p>
                <p className="flex items-center gap-1.5 text-xs text-cocoa/70">
                  <FulfillmentIcon size={14} aria-hidden="true" />
                  {FULFILLMENT_LABEL[r.fulfillment_type]} · siap {formatDate(parseDateKey(r.ready_date))}, {r.time_slot}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-beige">
                {showPayment ? <PaymentStatusBadge order={r} /> : <span />}
                <span className="flex items-center gap-1 font-bold text-cocoa tabular-nums">
                  {formatRupiah(r.total)}
                  <ChevronRight size={16} className="text-cocoa/60" aria-hidden="true" />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
