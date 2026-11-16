// components/admin/WorkOrderPlanSource.jsx
// CR-04b · FR-45 · K10 · AD-13 form WO — isian awal HANYA BACA dari rencana stok ready AD-07 (hanya hari ini), kalender
// produksi AD-05, dan WO aktif pada tanggal yang sama (Draft §8.1). Tidak mengubah AD-05/AD-07; pengguna mengisi sendiri.

import { formatNumber } from '../../utils/format';
import { WO_STATUS_META } from '../../constants/workOrder';

function Section({ title, empty, rows }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-cocoa/70">{title}</p>
      {rows.length === 0 ? <p className="text-xs text-cocoa/60">{empty}</p> : (
        <ul className="space-y-0.5 text-sm text-cocoa">
          {rows.map(([key, label, value]) => <li key={key} className="flex justify-between gap-3"><span>{label}</span><span className="tabular-nums">{value}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {object|null} source — getPlanSource(date)
 * @param {boolean} loading
 * @param {string} [error]
 */
export default function WorkOrderPlanSource({ source, loading, error }) {
  return (
    <section className="space-y-3 rounded-btn bg-beige/40 p-3" aria-label="Acuan perencanaan (hanya baca)">
      <p className="text-sm font-semibold text-cocoa">Acuan perencanaan <span className="font-normal text-cocoa/70">(hanya baca)</span></p>
      {loading && <p className="text-xs text-cocoa/70">Memuat acuan…</p>}
      {error && <p className="text-xs text-error">{error}</p>}
      {source && (
        <>
          <Section title="Rencana stok ready (menu Stok)" empty={source.date === source.today_key ? 'Belum ada rencana stok ready hari ini.' : 'Rencana stok ready hanya tersedia untuk hari ini.'}
            rows={source.ready_plan.map((r) => [r.product_id, r.name, formatNumber(r.qty_planned)])} />
          <Section title="Kalender produksi" empty="Tidak ada pesanan pada tanggal ini."
            rows={source.calendar.map((g, i) => [`${g.product_id}-${i}`, g.design_label ? `${g.name} · ${g.design_label}` : g.name, formatNumber(g.quantity)])} />
          <Section title="WO aktif tanggal ini" empty="Belum ada WO aktif."
            rows={source.active_work_orders.map((w) => [w.wo_id, `${w.wo_number} · ${w.product_name} (${WO_STATUS_META[w.status].label})`, formatNumber(w.qty_planned)])} />
        </>
      )}
    </section>
  );
}
