// components/admin/WorkOrderUsageTable.jsx
// CR-04b · FR-46 · BR-27 · AC-46.5 · AD-13 detail WO — pemakaian bahan per WO (Draft §8.4): standar = resep snapshot ×
// hasil bersih, aktual = Σ pengeluaran bertanda, selisih = aktual − standar. Bahan di luar resep: standar 0.

import DataTable from './DataTable';
import { formatNumber } from '../../utils/format';

/** Angka bahan maks. 3 desimal (standar dapat ber-3 desimal), format id-ID */
const amount = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 3 });

/**
 * @param {object} order — detail WO (usage[], net_output, without_recipe, recipe_snapshot_at)
 */
export default function WorkOrderUsageTable({ order }) {
  const cell = (v, u, tone = '') => <span className={`whitespace-nowrap tabular-nums ${tone}`}>{amount(v)} {u.unit}</span>;
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[160px]', render: (u) => <>{u.name}{u.in_recipe ? '' : <span className="ml-1 text-xs font-normal text-cocoa/65">(di luar resep)</span>}</> },
    { key: 'standard', header: 'Standar', align: 'right', render: (u) => cell(u.standard, u) },
    { key: 'actual', header: 'Aktual', align: 'right', render: (u) => cell(u.actual, u) },
    { key: 'variance', header: 'Selisih', align: 'right', render: (u) => cell(u.variance, u, u.variance > 0 ? 'text-error' : '') },
  ];
  return (
    <section className="card-admin space-y-3 p-4 md:p-6" aria-label="Pemakaian bahan">
      <div>
        <h3 className="text-base font-semibold text-cocoa">Pemakaian bahan</h3>
        <p className="text-xs text-cocoa/70">Standar dihitung dari resep yang dibekukan saat WO dimulai × hasil bersih ({formatNumber(order.net_output)}).</p>
      </div>
      {!order.recipe_snapshot_at && <p className="text-sm text-cocoa/70">Resep dibekukan saat WO dimulai.</p>}
      {order.without_recipe && <p role="status" className="rounded-btn border border-peach bg-peach/30 px-3 py-2 text-sm text-cocoa">WO tanpa resep: produk belum memiliki resep saat WO dimulai, sehingga standar pemakaian 0.</p>}
      {order.usage.length === 0
        ? (order.recipe_snapshot_at && <p className="text-sm text-cocoa/70">Belum ada pemakaian bahan.</p>)
        : <DataTable label={`Pemakaian bahan ${order.wo_number}`} columns={columns} rows={order.usage} rowKey={(u) => u.material_id} minWidth="min-w-[560px]" />}
    </section>
  );
}
