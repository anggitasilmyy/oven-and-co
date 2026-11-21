// components/admin/OperationsMovementTable.jsx
// CR-04c · FR-47 · BR-33 · AD-08 tab Operasional — mutasi stok bahan per bahan × jenis pada periode (`created_at` mutasi;
// pembalik/koreksi masuk periode pencatatannya). Opname tanpa selisih tidak membuat mutasi (tampil di riwayat bahan AD-07).

import DashboardPanel from './DashboardPanel';
import DataTable from './DataTable';
import { MOVEMENT_TYPE_LABEL } from '../../constants/purchasing';
import { formatNumber } from '../../utils/format';

/** @param {{rows: Array<{material_id, name, unit, type, qty_change, count}>}} props */
export default function OperationsMovementTable({ rows }) {
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[160px]' },
    { key: 'type', header: 'Jenis', render: (r) => MOVEMENT_TYPE_LABEL[r.type] },
    {
      key: 'qty_change', header: 'Perubahan', align: 'right',
      render: (r) => <span className={`whitespace-nowrap tabular-nums ${r.qty_change < 0 ? 'text-error-strong' : ''}`}>{r.qty_change > 0 ? '+' : ''}{formatNumber(r.qty_change)} {r.unit}</span>,
    },
    { key: 'count', header: 'Jumlah mutasi', align: 'right', render: (r) => <span className="tabular-nums">{r.count}</span> },
  ];
  return (
    <DashboardPanel title="Mutasi stok" description="Perubahan stok bahan per jenis mutasi yang dicatat pada periode ini">
      {rows.length === 0
        ? <p className="text-sm text-cocoa-muted">Belum ada mutasi stok pada periode ini.</p>
        : <DataTable label="Mutasi stok per bahan dan jenis" columns={columns} rows={rows} rowKey={(r) => `${r.material_id}-${r.type}`} minWidth="min-w-[560px]" />}
    </DashboardPanel>
  );
}
