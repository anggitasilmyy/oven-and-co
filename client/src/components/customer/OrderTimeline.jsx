// components/customer/OrderTimeline.jsx
// Step 5.4 · FR-17 · C-18 — stepper status vertikal dengan waktu (PRD Batch 5): langkah selesai Soft Brown
// dengan centang, langkah saat ini disorot, langkah berikutnya redup. Dibatalkan ditandai merah.

import { Check, X } from 'lucide-react';
import { formatDateShort, formatTime } from '../../utils/format';
import { ORDER_STATUS } from '../../constants/orderStatus';

/** @param {Array<{status, label, state, changed_at}>} steps — hasil buildTrackingSteps */
export default function OrderTimeline({ steps }) {
  return (
    <section aria-label="Riwayat status" className="card p-5 md:p-6">
      <h2 className="font-display text-xl text-cocoa mb-4">Lacak Pesanan</h2>
      <ol className="space-y-0">
        {steps.map((step, i) => {
          const cancelled = step.status === ORDER_STATUS.DIBATALKAN;
          const last = i === steps.length - 1;
          const circle = cancelled
            ? 'bg-error text-white'
            : step.state === 'done'
              ? 'bg-primary text-white'
              : step.state === 'current'
                ? 'bg-primary text-white ring-4 ring-primary/20'
                : 'bg-beige text-cocoa/40';
          return (
            <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0" aria-current={step.state === 'current' ? 'step' : undefined}>
              {!last && (
                <span aria-hidden="true" className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${step.state === 'done' ? 'bg-primary' : 'bg-beige'}`} />
              )}
              <span className={`relative z-[1] w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${circle}`}>
                {cancelled ? <X size={14} aria-hidden="true" /> : step.state === 'done' ? <Check size={14} aria-hidden="true" /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-semibold ${cancelled ? 'text-error' : step.state === 'upcoming' ? 'text-cocoa/50' : 'text-cocoa'}`}>
                  {step.label}
                  <span className="sr-only">{step.state === 'done' ? ' (selesai)' : step.state === 'current' ? ' (saat ini)' : ' (berikutnya)'}</span>
                </p>
                {step.changed_at && (
                  <p className="text-xs text-cocoa/65 tabular-nums">{formatDateShort(step.changed_at)} · {formatTime(step.changed_at)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
