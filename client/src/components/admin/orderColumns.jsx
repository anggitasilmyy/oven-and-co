// components/admin/orderColumns.jsx
// Step 4 · AD-02 & AD-03 — definisi kolom tabel pesanan (dipakai DataTable)

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';
import { ADMIN_ROUTES, buildPath } from '../../constants/routes';
import { FULFILLMENT_LABEL } from '../../constants/orderStatus';
import { formatRupiah, formatDateShort, formatTime } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

export const orderDetailPath = (orderNumber) => buildPath(ADMIN_ROUTES.DETAIL_PESANAN, { orderNumber });

const detailLink = (row) => (
  <Link
    to={orderDetailPath(row.order_number)}
    className="inline-flex items-center justify-center gap-0.5 h-11 min-w-touch-min px-2 xl:px-3 rounded-lg border border-beige text-xs font-semibold
               text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    aria-label={`Detail pesanan ${row.order_number}`}
  >
    <span className="hidden xl:inline">Detail</span>
    <ChevronRight size={16} aria-hidden="true" />
  </Link>
);

const COLUMNS = {
  orderNumber: { key: 'order_number', header: 'No. Pesanan', className: 'font-semibold whitespace-nowrap' },
  orderWithDate: {
    key: 'order_number',
    header: 'No. Pesanan',
    className: 'whitespace-nowrap',
    render: (r) => (
      <>
        <span className="font-semibold">{r.order_number}</span>
        <span className="block text-xs text-cocoa/60">
          Dipesan {formatDateShort(r.created_at)}, {formatTime(r.created_at)}
        </span>
      </>
    ),
  },
  customer: { key: 'customer_name', header: 'Pelanggan', className: 'whitespace-nowrap' },
  items: { key: 'items_summary', header: 'Item', className: 'max-w-[160px] truncate' },
  fulfillment: {
    key: 'fulfillment_type', header: 'Pengambilan', render: (r) => FULFILLMENT_LABEL[r.fulfillment_type],
  },
  readyDate: {
    key: 'ready_date',
    header: 'Pengambilan & Siap',
    className: 'whitespace-nowrap',
    render: (r) => (
      <>
        <span className="font-medium">{FULFILLMENT_LABEL[r.fulfillment_type]}</span> · {formatDateShort(parseDateKey(r.ready_date))}
        <span className="block text-xs text-cocoa/60">{r.time_slot}</span>
      </>
    ),
  },
  total: { key: 'total', header: 'Total', align: 'right', className: 'font-semibold whitespace-nowrap', render: (r) => formatRupiah(r.total) },
  payment: {
    key: 'payment',
    header: 'Pembayaran',
    render: (r) => (
      <div className="space-y-1">
        <PaymentStatusBadge order={r} />
        <span className="block text-xs text-cocoa/60 max-w-[130px]">{r.method_name}</span>
      </div>
    ),
  },
  status: { key: 'order_status', header: 'Status', render: (r) => <StatusBadge status={r.order_status} /> },
  action: { key: 'action', header: 'Aksi', align: 'right', render: detailLink },
};

/** Kolom tabel AD-03 (lengkap) */
export const ADMIN_ORDER_COLUMNS = [
  COLUMNS.orderWithDate, COLUMNS.customer, COLUMNS.readyDate, COLUMNS.total, COLUMNS.payment, COLUMNS.status, COLUMNS.action,
];

/** Kolom "Pesanan Terbaru" di AD-02 */
export const RECENT_ORDER_COLUMNS = [
  COLUMNS.orderNumber, COLUMNS.customer,
  // Ringkasan item & pengambilan hanya ≥ 1280 px agar tabel muat di samping sidebar
  { ...COLUMNS.items, visibility: 'hidden xl:table-cell' },
  { ...COLUMNS.fulfillment, visibility: 'hidden xl:table-cell' }, COLUMNS.total, COLUMNS.status, COLUMNS.action,
];
