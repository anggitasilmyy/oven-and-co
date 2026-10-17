// components/customer/OrderHistoryCard.jsx
// Step 5.4 · FR-19 · FR-21 · BR-11 · C-17 — kartu pesanan: nomor, tanggal, foto bertumpuk, jumlah item, total,
// badge status; tombol Lacak (aktif) atau Pesan Lagi & Beri Ulasan (selesai, PRD Batch 5).

import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import ProductImage from '../ui/ProductImage';
import { formatRupiah, formatDate, formatTime } from '../../utils/format';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { ORDER_STATUS } from '../../constants/orderStatus';
import { ORDER_HISTORY_TABS, ORDER_HISTORY_TAB } from '../../constants/orderHistory';

const ACTIVE_STATUSES = ORDER_HISTORY_TABS.find((t) => t.key === ORDER_HISTORY_TAB.AKTIF).statuses;

/**
 * @param {object} order — baris getMyOrders
 * @param {Function} onReorder — (orderNumber) → void
 * @param {boolean} reordering — tombol Pesan Lagi sedang diproses
 */
export default function OrderHistoryCard({ order, onReorder, reordering }) {
  const navigate = useNavigate();
  const detailPath = buildPath(CUSTOMER_ROUTES.DETAIL_PESANAN, { orderNumber: order.order_number });
  const isActive = ACTIVE_STATUSES.includes(order.order_status);
  const extra = order.items_summary.length - 1;

  return (
    <li className="card p-4 md:p-5 flex flex-col gap-3">
      <Link
        to={detailPath}
        className="flex flex-col gap-3 -m-1 p-1 rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`Lihat detail pesanan ${order.order_number}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono font-bold text-cocoa tracking-wide">{order.order_number}</p>
            <p className="text-xs text-cocoa/65">{formatDate(order.created_at)} · {formatTime(order.created_at)}</p>
          </div>
          <StatusBadge status={order.order_status} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-3 shrink-0" aria-hidden="true">
            {order.thumbnails.map((t, i) => (
              <ProductImage key={i} src={t.image_url} sizes="56px" className="w-12 h-12 md:w-14 md:h-14 rounded-btn object-cover ring-2 ring-surface" />
            ))}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-cocoa truncate">
              {order.items_summary[0]}{extra > 0 && <span className="font-normal text-cocoa/65"> +{extra} lainnya</span>}
            </p>
            <p className="text-xs text-cocoa/65">{order.item_count} item</p>
          </div>
          <ChevronRight size={18} className="text-cocoa/40 shrink-0" aria-hidden="true" />
        </div>
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-beige">
        <div>
          <p className="text-xs text-cocoa/65">Total</p>
          <p className="font-bold text-cocoa tabular-nums">{formatRupiah(order.total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <Button size="sm" variant="secondary" onClick={() => navigate(detailPath)}>Lacak Pesanan</Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => onReorder(order.order_number)} loading={reordering}>
                Pesan Lagi
              </Button>
              {order.order_status === ORDER_STATUS.SELESAI && order.can_review && (
                <Button size="sm" onClick={() => navigate(buildPath(CUSTOMER_ROUTES.FORM_ULASAN, { orderNumber: order.order_number }))}>
                  Beri Ulasan
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
