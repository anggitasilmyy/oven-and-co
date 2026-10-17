// components/admin/ProductionDayPanel.jsx
// Step 5.6 · FR-29 · AD-05 — daftar produksi tanggal terpilih, dikelompokkan per produk dengan jumlah dan nomor pesanan
// (PRD Batch 6). Nomor pesanan menuju AD-04, tempat status diubah.

import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import StatusBadge from '../ui/StatusBadge';
import { orderDetailPath } from './orderColumns';
import { AVAILABILITY_BADGE } from '../../constants/product';
import { FULFILLMENT_LABEL } from '../../constants/orderStatus';
import { formatDateFull } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

/**
 * @param {string} date — "YYYY-MM-DD"
 * @param {Array} groups — selected.groups dari getProductionCalendar
 */
export default function ProductionDayPanel({ date, groups }) {
  const total = groups.reduce((s, g) => s + g.quantity, 0);
  return (
    <section aria-labelledby="production-day-title" className="card-admin p-4 md:p-6">
      <h2 id="production-day-title" className="font-display text-lg text-cocoa">{formatDateFull(parseDateKey(date))}</h2>
      <p className="text-sm text-cocoa/70 mb-4" aria-live="polite">{groups.length ? `${total} item untuk diproduksi` : 'Tidak ada produksi'}</p>
      {groups.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={32} aria-hidden="true" />} title="Belum ada produksi" description="Tidak ada pesanan pre-order atau custom cake yang siap pada tanggal ini." />
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => {
            const badge = AVAILABILITY_BADGE[g.availability_type];
            return (
              <li key={g.key} className="rounded-xl border border-beige p-3 md:p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-cocoa leading-snug">{g.name}</p>
                    {g.design_label && <p className="text-xs text-cocoa/70 break-words">{g.design_label}</p>}
                  </div>
                  <span className="shrink-0 font-bold text-lg text-primary tabular-nums" aria-label={`${g.quantity} item`}>×{g.quantity}</span>
                </div>
                <Badge variant={badge.variant} className="!px-2.5 text-[11px]">{badge.label}</Badge>
                <ul className="divide-y divide-beige/70 text-sm">
                  {g.orders.map((o) => (
                    <li key={o.order_number} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link to={orderDetailPath(o.order_number)} className="inline-flex items-center min-h-touch-min font-mono font-semibold text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded">
                        {o.order_number}
                      </Link>
                      <span className="text-xs text-cocoa/70 tabular-nums">×{o.quantity} · {FULFILLMENT_LABEL[o.fulfillment_type]} {o.time_slot}</span>
                      <StatusBadge status={o.order_status} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
