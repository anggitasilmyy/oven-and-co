// components/admin/OrderStatusLog.jsx
// Step 5.6 · FR-28 · SPEC §4 · AD-04 — log status dari order_status_histories (waktu, pengubah, catatan)

import StatusBadge from '../ui/StatusBadge';
import { ROLE_LABEL } from '../../constants/roles';
import { formatDateShort, formatTime } from '../../utils/format';

/** @param {Array<{history_id, status, note, changed_at, changed_by_name, changed_by_role}>} log — terbaru di atas */
export default function OrderStatusLog({ log }) {
  return (
    <section aria-labelledby="admin-status-log-title" className="card-admin p-5 md:p-6">
      <h2 id="admin-status-log-title" className="font-display text-lg text-cocoa mb-3">Log Status</h2>
      {log.length === 0 ? (
        <p className="text-sm text-cocoa/65">Belum ada riwayat status.</p>
      ) : (
        <ol className="space-y-3">
          {log.map((h) => (
            <li key={h.history_id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4 pb-3 border-b border-beige/70 last:border-0 last:pb-0">
              <div className="min-w-0 space-y-1">
                <StatusBadge status={h.status} />
                <p className="text-xs text-cocoa/70">
                  oleh {h.changed_by_name}{h.changed_by_role ? ` (${ROLE_LABEL[h.changed_by_role]})` : ''}
                </p>
                {h.note && <p className="text-xs text-cocoa break-words">{h.note}</p>}
              </div>
              <time dateTime={h.changed_at} className="text-xs text-cocoa/70 tabular-nums shrink-0">
                {formatDateShort(h.changed_at)} · {formatTime(h.changed_at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
