// components/admin/OperationsProductionTables.jsx
// CR-04c · FR-47 · BR-29, BR-36 · AD-08 tab Operasional — hasil produksi per WO (dokumen hasil `recorded_at` periode; label
// "dikoreksi" bila ada pembalik/pengganti di periode) dan rencana vs hasil per produk (rencana = seluruh WO, termasuk
// Dibatalkan, dengan tanggal produksi di periode; hasil = tanggal pencatatan). Hasil tidak menambah stok jual (K13).

import Badge from '../ui/Badge';
import DashboardPanel from './DashboardPanel';
import DataTable from './DataTable';
import { formatNumber } from '../../utils/format';

const num = (v) => <span className="tabular-nums">{formatNumber(v)}</span>;

/** @param {{production: Array, plan: Array}} props */
export default function OperationsProductionTables({ production, plan }) {
  const woColumns = [
    { key: 'wo_number', header: 'Nomor WO', className: 'font-semibold' },
    { key: 'product_name', header: 'Produk', className: 'min-w-[160px]' },
    { key: 'net_output', header: 'Hasil bersih', align: 'right', render: (r) => num(r.net_output) },
    { key: 'corrected', header: 'Keterangan', render: (r) => (r.corrected ? <Badge variant="preorder">dikoreksi</Badge> : '') },
  ];
  const planColumns = [
    { key: 'product_name', header: 'Produk', className: 'font-semibold min-w-[160px]' },
    { key: 'qty_planned', header: 'Rencana', align: 'right', render: (r) => num(r.qty_planned) },
    { key: 'net_output', header: 'Hasil', align: 'right', render: (r) => num(r.net_output) },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <DashboardPanel title="Hasil produksi" description="Hasil bersih per work order yang dicatat pada periode ini">
        {production.length === 0
          ? <p className="text-sm text-cocoa-muted">Belum ada hasil produksi pada periode ini.</p>
          : <DataTable label="Hasil produksi per work order" columns={woColumns} rows={production} rowKey={(r) => r.wo_id} minWidth="min-w-[480px]" />}
      </DashboardPanel>
      <DashboardPanel title="Rencana vs hasil" description="Rencana menurut tanggal produksi; hasil menurut tanggal pencatatan">
        {plan.length === 0
          ? <p className="text-sm text-cocoa-muted">Belum ada rencana atau hasil pada periode ini.</p>
          : <DataTable label="Rencana dan hasil produksi per produk" columns={planColumns} rows={plan} rowKey={(r) => r.product_id} minWidth="min-w-[400px]" />}
      </DashboardPanel>
    </div>
  );
}
