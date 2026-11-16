// components/admin/WorkOrderDocuments.jsx
// CR-04b · FR-46 · UC-37 · BR-26, BR-27, BR-30 · AD-13 detail WO — riwayat dokumen pengeluaran bahan & hasil produksi.
// Dokumen berlaku → Koreksi / Balik (hasil 0 hanya Koreksi, §8.2). Dokumen tidak pernah dihapus atau diubah.

import Button from '../ui/Button';
import { ISSUE_KIND_LABEL, OUTPUT_KIND_LABEL } from '../../constants/workOrder';
import { formatNumber, formatDateShort } from '../../utils/format';

function DocItem({ title, detail, reason, actions }) {
  return (
    <li className="flex flex-col gap-2 rounded-btn border border-beige p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-cocoa">{title}</p>
        {detail && <p className="text-xs text-cocoa/75">{detail}</p>}
        {reason && <p className="text-xs text-cocoa/75">Alasan: {reason}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </li>
  );
}

const meta = (date, effective, kind) => ` · ${formatDateShort(date)}${!effective && kind !== 'pembalik' ? ' · tidak berlaku lagi' : ''}`;

/**
 * @param {object} order — detail WO (issues[], outputs[])
 * @param {Function} onAction — ({ type: 'issue-reverse'|'issue-correct'|'output-reverse'|'output-correct', doc }) → void
 */
export default function WorkOrderDocuments({ order, onAction }) {
  const actions = (doc, prefix, reversible) => doc.effective && (
    <>
      <Button size="sm" variant="secondary" onClick={() => onAction({ type: `${prefix}-correct`, doc })}>Koreksi</Button>
      {reversible && <Button size="sm" variant="danger" onClick={() => onAction({ type: `${prefix}-reverse`, doc })}>Balik</Button>}
    </>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card-admin space-y-3 p-4 md:p-6" aria-label="Riwayat pengeluaran bahan">
        <h3 className="text-base font-semibold text-cocoa">Pengeluaran bahan</h3>
        {order.issues.length === 0 ? <p className="text-sm text-cocoa/70">Belum ada pengeluaran.</p> : (
          <ul className="space-y-2">
            {order.issues.map((d) => (
              <DocItem key={d.issue_id} title={<>{ISSUE_KIND_LABEL[d.kind]} #{d.issue_id}<span className="font-normal text-cocoa/65">{meta(d.created_at, d.effective, d.kind)}</span></>}
                detail={d.lines.map((l) => `${l.name} ${formatNumber(l.qty)} ${l.unit}`).join(' · ')} reason={d.reason} actions={actions(d, 'issue', true)} />
            ))}
          </ul>
        )}
      </section>
      <section className="card-admin space-y-3 p-4 md:p-6" aria-label="Riwayat hasil produksi">
        <h3 className="text-base font-semibold text-cocoa">Hasil produksi</h3>
        {order.outputs.length === 0 ? <p className="text-sm text-cocoa/70">Hasil dicatat saat WO diselesaikan.</p> : (
          <ul className="space-y-2">
            {order.outputs.map((d) => (
              <DocItem key={d.output_id} title={<>{OUTPUT_KIND_LABEL[d.kind]} #{d.output_id}: <span className="tabular-nums">{formatNumber(d.qty_output)}</span><span className="font-normal text-cocoa/65">{meta(d.recorded_at, d.effective, d.kind)}</span></>}
                reason={d.reason} actions={actions(d, 'output', d.qty_output > 0)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
