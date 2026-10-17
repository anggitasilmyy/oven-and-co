// components/customer/PointHistoryList.jsx
// Step 5.5 · FR-22 · BR-09 · BR-11 · C-21 — riwayat poin: "+508 poin · Pesanan OVC-…", "-1.000 poin · Ditukar saat checkout".

import { formatDateShort, formatNumber, formatTime } from '../../utils/format';
import { POINT_TX_LABEL } from '../../constants/account';

/** @param {Array} items — hasil loyaltyService.getMyPointHistory() */
export default function PointHistoryList({ items }) {
  return (
    <ul className="card divide-y divide-beige" aria-label="Riwayat poin">
      {items.map((tx) => {
        const plus = tx.points >= 0;
        return (
          <li key={tx.point_tx_id} className="flex items-center gap-4 px-4 py-3 md:px-5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cocoa">{POINT_TX_LABEL[tx.type] ?? tx.type}</p>
              <p className="text-xs text-cocoa/70">
                {formatDateShort(tx.created_at)} · {formatTime(tx.created_at)}
                {tx.order_number && <> · Pesanan <span className="font-mono font-semibold text-cocoa">{tx.order_number}</span></>}
              </p>
            </div>
            <p className={`shrink-0 text-sm font-bold tabular-nums ${plus ? 'text-[#3F6B3A]' : 'text-error'}`}>
              {plus ? '+' : '−'}{formatNumber(Math.abs(tx.points))} poin
            </p>
          </li>
        );
      })}
    </ul>
  );
}
