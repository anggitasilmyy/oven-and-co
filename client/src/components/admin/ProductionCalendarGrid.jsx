// components/admin/ProductionCalendarGrid.jsx
// Step 5.6 · FR-29 · AD-05 — kalender bulanan; tiap tanggal menampilkan jumlah pesanan pre-order (peach) dan
// custom cake (pink) sebagai pill (PRD Batch 6). Di bawah 2xl pill hanya angka (warna dijelaskan legenda) agar
// 7 kolom muat di samping panel daftar; label lengkap ada di aria-label tombol tanggal.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CALENDAR_WEEKDAYS } from '../../constants/adminOrder';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const NAV_BTN = 'w-11 h-11 flex items-center justify-center rounded-full border border-beige text-cocoa hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

const monthTitle = (monthKey) => parseDateKey(`${monthKey}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

function CountPill({ count, kind }) {
  if (!count) return null;
  const isCustom = kind === 'custom';
  return (
    <span className={`block rounded-pill px-1.5 text-[11px] font-semibold leading-5 text-cocoa truncate tabular-nums ${isCustom ? 'bg-pink' : 'bg-peach'}`}>
      {count}<span className="hidden 2xl:inline"> {isCustom ? 'Custom' : 'Pre-order'}</span>
    </span>
  );
}

/**
 * @param {{month_key, today_key, weeks, counts}} calendar
 * @param {string} selectedDate
 * @param {Function} onSelect — (dateKey)
 * @param {Function} onShiftMonth — (delta)
 * @param {Function} onToday
 */
export default function ProductionCalendarGrid({ calendar, selectedDate, onSelect, onShiftMonth, onToday }) {
  return (
    <section aria-labelledby="calendar-month-title" className="card-admin p-3 sm:p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 id="calendar-month-title" className="font-display text-xl text-cocoa capitalize" aria-live="polite">{monthTitle(calendar.month_key)}</h2>
        <div className="flex items-center gap-2">
          <button type="button" className={NAV_BTN} onClick={() => onShiftMonth(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="h-11 px-4 rounded-full border border-beige text-sm font-semibold text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={onToday}>Hari ini</button>
          <button type="button" className={NAV_BTN} onClick={() => onShiftMonth(1)} aria-label="Bulan berikutnya"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-3 text-xs text-cocoa/80" aria-label="Keterangan">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-peach" aria-hidden="true" /> Pre-order</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-pink" aria-hidden="true" /> Custom cake</span>
      </div>
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        <div aria-hidden="true" className="contents">
          {CALENDAR_WEEKDAYS.map((d) => (
            <span key={d} className="text-center text-[11px] md:text-xs font-semibold uppercase tracking-wide text-cocoa/60 py-1">{d}</span>
          ))}
        </div>
        {calendar.weeks.map((week) => (
          <div key={week[0].date} className="contents">
            {week.map(({ date, inMonth }) => {
              const c = calendar.counts[date] ?? { preorder: 0, custom: 0 };
              const selected = date === selectedDate;
              const today = date === calendar.today_key;
              const summary = c.preorder || c.custom ? `${c.preorder} pre-order, ${c.custom} custom cake` : 'tidak ada produksi';
              return (
                <div key={date} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelect(date)}
                    aria-label={`${formatDate(parseDateKey(date))}: ${summary}`}
                    aria-pressed={selected}
                    data-date={date}
                    className={`w-full min-h-[56px] md:min-h-[84px] rounded-xl p-1 md:p-2 flex flex-col items-stretch gap-1 text-left border transition
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                      ${selected ? 'border-primary bg-beige/70' : 'border-transparent hover:bg-cream'} ${inMonth ? '' : 'opacity-45'}`}
                  >
                    <span className={`self-start text-xs md:text-sm font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full ${today ? 'bg-primary text-white' : 'text-cocoa'}`}>
                      {Number(date.slice(8))}
                    </span>
                    <CountPill count={c.preorder} kind="preorder" />
                    <CountPill count={c.custom} kind="custom" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
