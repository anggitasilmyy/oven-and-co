// components/customer/ReadyDateBanner.jsx
// Step 5.3 · BR-03 · C-12 · C-13 — banner Pastel Peach tanggal siap pesanan berisi item pre-order/custom

import { CalendarClock } from 'lucide-react';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

/** @param {string} readyDate — tanggal siap gabungan (BR-03) */
export default function ReadyDateBanner({ readyDate }) {
  return (
    <p className="flex items-start gap-2.5 rounded-btn bg-peach/70 px-4 py-3 text-sm text-cocoa" role="note">
      <CalendarClock size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>Pesanan berisi item pre-order. Semua item akan siap pada <strong>{formatDate(parseDateKey(readyDate))}</strong>.</span>
    </p>
  );
}
