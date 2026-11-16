// components/admin/WorkOrderPanel.jsx
// CR-04b · FR-45 · UC-36 · BR-25 · AD-13 daftar Work Order — nomor, produk, tanggal produksi, rencana, hasil bersih, status;
// tombol Buat WO; buka detail (?wo=<id>). Tabel di ≥ md, kartu di < md.

import { useState } from 'react';
import { Factory, Plus } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import WorkOrderFormModal from './WorkOrderFormModal';
import { WO_STATUS, WO_STATUS_META } from '../../constants/workOrder';
import { formatNumber, formatDateShort } from '../../utils/format';

/**
 * @param {Array} orders — dari getWorkOrders
 * @param {Array} products — baris getAdminProducts (produk aktif dipilih di form)
 * @param {Function} onOpen — (woId) → void
 * @param {Function} onCreated — (wo, message) → void
 */
export default function WorkOrderPanel({ orders, products, onOpen, onCreated }) {
  const [creating, setCreating] = useState(false);
  const status = (w) => <Badge variant={WO_STATUS_META[w.status].variant}>{WO_STATUS_META[w.status].label}</Badge>;
  const open = (w) => (
    <button type="button" onClick={() => onOpen(w.wo_id)} className="min-h-touch-min font-semibold text-primary underline-offset-2 hover:underline">{w.wo_number}</button>
  );
  const output = (w) => (w.status === WO_STATUS.SELESAI ? <span className="tabular-nums">{formatNumber(w.net_output)}</span> : <span className="text-cocoa/50">–</span>);
  const columns = [
    { key: 'wo_number', header: 'Nomor WO', render: open },
    { key: 'product_name', header: 'Produk', className: 'min-w-[180px]' },
    { key: 'production_date', header: 'Tanggal produksi', render: (w) => formatDateShort(w.production_date) },
    { key: 'qty_planned', header: 'Rencana', align: 'right', render: (w) => <span className="tabular-nums">{formatNumber(w.qty_planned)}</span> },
    { key: 'net_output', header: 'Hasil', align: 'right', render: output },
    { key: 'status', header: 'Status', render: status },
  ];
  const noActiveProduct = !products.some((p) => p.is_active);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-cocoa/75">WO baru disimpan sebagai Draft. Resep dibekukan saat WO dimulai.</p>
        <Button size="sm" onClick={() => setCreating(true)} disabled={noActiveProduct} leftIcon={<Plus size={16} aria-hidden="true" />}>Buat WO</Button>
      </div>
      {orders.length === 0 ? (
        <div className="card-admin">
          <EmptyState icon={<Factory size={32} aria-hidden="true" />} title="Belum ada work order" description="Buat work order untuk merencanakan produksi satu produk pada satu tanggal." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {orders.map((w) => (
              <li key={w.wo_id} className="card-admin space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">{open(w)}{status(w)}</div>
                <p className="text-sm font-semibold text-cocoa">{w.product_name}</p>
                <p className="text-xs text-cocoa/75">{formatDateShort(w.production_date)} · rencana {formatNumber(w.qty_planned)}{w.status === WO_STATUS.SELESAI ? ` · hasil ${formatNumber(w.net_output)}` : ''}</p>
              </li>
            ))}
          </ul>
          <div className="card-admin hidden p-1 md:block 2xl:p-3">
            <DataTable label="Daftar work order" columns={columns} rows={orders} rowKey={(w) => w.wo_id} minWidth="min-w-[760px]" />
          </div>
        </>
      )}
      {creating && <WorkOrderFormModal order={null} products={products} onClose={() => setCreating(false)} onSaved={(wo, message) => { setCreating(false); onCreated(wo, message); }} />}
    </div>
  );
}
