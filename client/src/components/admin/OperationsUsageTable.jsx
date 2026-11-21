// components/admin/OperationsUsageTable.jsx
// CR-04c · FR-47 · BR-27 · AC-46.5 · AD-08 tab Operasional — pemakaian bahan per periode, tiga kolom terpisah (§9):
// standar (snapshot × hasil bertanda, `recorded_at` dokumen hasil; 3 desimal), aktual (−mutasi pengeluaran, `created_at`;
// positif = terpakai, pengembalian negatif), selisih = aktual − standar (bertanda). Angka eksak dari API.

import DashboardPanel from './DashboardPanel';
import DataTable from './DataTable';

const amount = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 3 });

/** @param {{rows: Array<{material_id, name, unit, standard, actual, variance}>}} props */
export default function OperationsUsageTable({ rows }) {
  const cell = (v, u, tone = '') => <span className={`whitespace-nowrap tabular-nums ${tone}`}>{amount(v)} {u.unit}</span>;
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[160px]' },
    { key: 'standard', header: 'Standar', align: 'right', render: (u) => cell(u.standard, u) },
    { key: 'actual', header: 'Aktual', align: 'right', render: (u) => cell(u.actual, u) },
    { key: 'variance', header: 'Selisih', align: 'right', render: (u) => cell(u.variance, u, u.variance > 0 ? 'text-error-strong' : '') },
  ];
  return (
    <DashboardPanel title="Pemakaian bahan" description="Standar dari hasil produksi yang dicatat, aktual dari pengeluaran bahan yang dicatat pada periode ini">
      {rows.length === 0
        ? <p className="text-sm text-cocoa-muted">Belum ada pemakaian bahan pada periode ini.</p>
        : <DataTable label="Pemakaian bahan standar, aktual, dan selisih" columns={columns} rows={rows} rowKey={(r) => r.material_id} minWidth="min-w-[560px]" />}
    </DashboardPanel>
  );
}
