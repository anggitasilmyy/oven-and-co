// components/admin/ReportPeriodFilter.jsx
// Step 5.8 · FR-33 · AD-08 — filter periode: Harian, Mingguan, Bulanan, atau rentang tanggal khusus
// Pilihan periode langsung diterapkan; rentang khusus diterapkan lewat tombol Tampilkan (validasi inline).

import { useState } from 'react';
import Button from '../ui/Button';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { REPORT_PERIOD, REPORT_PERIOD_OPTIONS, REPORT_MAX_RANGE_DAYS } from '../../constants/report';
import { resolveReportRange } from '../../utils/businessRules';

/**
 * @param {{period, from, to}} value — filter aktif
 * @param {string} todayKey
 * @param {Function} onChange — ({period, from?, to?}) → void
 */
export default function ReportPeriodFilter({ value, todayKey, onChange }) {
  const [draft, setDraft] = useState({ from: value.from ?? '', to: value.to ?? '' });
  const [error, setError] = useState('');
  const isRange = value.period === REPORT_PERIOD.RENTANG;

  const pick = (period) => {
    setError('');
    if (period === REPORT_PERIOD.RENTANG) {
      // Isi awal rentang dengan periode yang sedang tampil agar Owner tinggal menyesuaikan
      const from = draft.from || value.from || todayKey;
      const to = draft.to || value.to || todayKey;
      setDraft({ from, to });
      onChange({ period, from, to });
    } else onChange({ period });
  };
  const apply = (e) => {
    e.preventDefault();
    const range = resolveReportRange({ period: REPORT_PERIOD.RENTANG, ...draft }, todayKey);
    if (range.error) { setError(range.error); return; }
    setError('');
    onChange({ period: REPORT_PERIOD.RENTANG, from: draft.from, to: draft.to });
  };

  return (
    <div className="card-admin space-y-4 p-4 md:p-5">
      <div role="group" aria-label="Periode laporan" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {REPORT_PERIOD_OPTIONS.map((o) => {
          const active = o.key === value.period;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => pick(o.key)}
              className={`h-11 rounded-btn px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                          ${active ? 'bg-primary text-white' : 'border border-beige bg-white text-cocoa hover:bg-beige/50'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {isRange && (
        <form noValidate onSubmit={apply} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
          <FormField id="report-from" label="Tanggal mulai">
            <input type="date" max={todayKey} className={fieldClass(error)} value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </FormField>
          <FormField id="report-to" label="Tanggal selesai" error={error || undefined} hint={`Maksimal ${REPORT_MAX_RANGE_DAYS} hari`}>
            <input type="date" max={todayKey} className={fieldClass(error)} value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </FormField>
          <Button type="submit" size="sm" className="sm:mt-[30px]">Tampilkan</Button>
        </form>
      )}
    </div>
  );
}
