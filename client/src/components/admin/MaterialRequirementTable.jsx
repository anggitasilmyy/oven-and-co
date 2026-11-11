// components/admin/MaterialRequirementTable.jsx
// CR-03 CP7 · FR-40 · BR-15 · AD-07 tab Kebutuhan Bahan — tabel (≥ md) / kartu (< md) per bahan. Kolom & label §B8:
// Bahan · Stok saat ini · Kebutuhan <D> · Total s.d. <D> (termasuk tertunggak) · Sisa setelah dialokasikan · Status.
// Semua angka = nilai API apa adanya (tanpa perhitungan ulang); format id-ID maks. 3 desimal.

import Badge from '../ui/Badge';
import DataTable from './DataTable';
import { MATERIAL_DEMAND_STATUS_META } from '../../constants/recipe';
import { formatNumber } from '../../utils/format';

const qty = (value, unit) => <span className="whitespace-nowrap tabular-nums">{formatNumber(value)} {unit}</span>;
const statusBadge = (r) => <Badge variant={MATERIAL_DEMAND_STATUS_META[r.status].variant}>{MATERIAL_DEMAND_STATUS_META[r.status].label}</Badge>;

function TotalCell({ row }) {
  return (
    <>
      {qty(row.cumulative_need, row.unit)}
      {row.backlog_need > 0 && <span className="block text-xs text-cocoa/65">Termasuk tertunggak: {formatNumber(row.backlog_need)} {row.unit}</span>}
    </>
  );
}

function RemainingCell({ row }) {
  return (
    <>
      <span className={row.remaining < 0 ? 'font-semibold text-error' : ''}>{qty(row.remaining, row.unit)}</span>
      {row.shortage > 0 && <span className="block text-xs font-semibold text-error">Kurang {formatNumber(row.shortage)} {row.unit}</span>}
    </>
  );
}

/** @param {{rows: Array, dateLabel: string}} props — dateLabel mis. "Sab, 14 Nov" */
export default function MaterialRequirementTable({ rows, dateLabel }) {
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[180px]' },
    { key: 'stock', header: 'Stok saat ini', align: 'right', render: (r) => qty(r.stock, r.unit) },
    { key: 'daily_need', header: `Kebutuhan ${dateLabel}`, align: 'right', render: (r) => qty(r.daily_need, r.unit) },
    {
      key: 'cumulative_need', align: 'right', render: (r) => <TotalCell row={r} />,
      header: <>Total s.d. {dateLabel}<span className="block text-xs font-normal normal-case">termasuk tertunggak</span></>,
    },
    { key: 'remaining', header: 'Sisa setelah dialokasikan', align: 'right', render: (r) => <RemainingCell row={r} /> },
    { key: 'status', header: 'Status', render: statusBadge },
  ];
  return (
    <>
      <ul className="space-y-3 md:hidden" aria-label="Kebutuhan per bahan">
        {rows.map((r) => (
          <li key={r.material_id} className="card-admin space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-cocoa">{r.name}</p>
              {statusBadge(r)}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div><dt className="text-cocoa/60">Stok saat ini</dt><dd className="font-semibold text-cocoa">{qty(r.stock, r.unit)}</dd></div>
              <div><dt className="text-cocoa/60">Kebutuhan {dateLabel}</dt><dd className="font-semibold text-cocoa">{qty(r.daily_need, r.unit)}</dd></div>
              <div><dt className="text-cocoa/60">Total s.d. {dateLabel} (termasuk tertunggak)</dt><dd className="font-semibold text-cocoa"><TotalCell row={r} /></dd></div>
              <div><dt className="text-cocoa/60">Sisa setelah dialokasikan</dt><dd className="font-semibold text-cocoa"><RemainingCell row={r} /></dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="card-admin hidden p-1 md:block 2xl:p-3">
        <DataTable label="Kebutuhan per bahan" columns={columns} rows={rows} rowKey={(r) => r.material_id} minWidth="min-w-[860px]" />
      </div>
    </>
  );
}
