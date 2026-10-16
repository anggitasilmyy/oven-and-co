// components/ui/StatusBadge.jsx
// Step 4 · Badge status pesanan — label & warna HANYA dari constants/orderStatus.js (SPEC §4)

import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '../../constants/orderStatus';

/** @param {string} status — kode enum order_status */
export default function StatusBadge({ status, className = '' }) {
  return (
    <span className={`badge whitespace-nowrap ${ORDER_STATUS_COLOR[status] ?? 'bg-beige text-cocoa'} ${className}`}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
