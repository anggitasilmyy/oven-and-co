// components/admin/PurchaseOrderPanel.jsx
// CR-04a CP6 · FR-42 · UC-34 · BR-19, BR-22 · AD-12 tab Purchase Order (default) — daftar PO (nomor, supplier, status,
// jumlah item, nilai PO, tanggal), tombol Buat PO, buka detail (?po=<id>). Tabel di ≥ md, kartu di < md.

import { useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import PurchaseOrderFormModal from './PurchaseOrderFormModal';
import { PO_STATUS_META } from '../../constants/purchasing';
import { formatRupiah, formatDateShort } from '../../utils/format';

/**
 * @param {Array} orders — dari getPurchaseOrders
 * @param {Array} suppliers — dari getSuppliers
 * @param {Function} onOpen — (poId) → void
 * @param {Function} onCreated — (po, message) → void
 */
export default function PurchaseOrderPanel({ orders, suppliers, onOpen, onCreated }) {
  const [creating, setCreating] = useState(false);
  const status = (p) => <Badge variant={PO_STATUS_META[p.status].variant}>{PO_STATUS_META[p.status].label}</Badge>;
  const open = (p) => (
    <button type="button" onClick={() => onOpen(p.po_id)} className="min-h-touch-min font-semibold text-primary underline-offset-2 hover:underline">{p.po_number}</button>
  );
  const columns = [
    { key: 'po_number', header: 'Nomor PO', render: open },
    { key: 'supplier_name', header: 'Supplier', className: 'min-w-[160px]' },
    { key: 'status', header: 'Status', render: status },
    { key: 'item_count', header: 'Item', align: 'right' },
    { key: 'order_value', header: 'Nilai PO', align: 'right', render: (p) => <span className="tabular-nums">{formatRupiah(p.order_value)}</span> },
    { key: 'created_at', header: 'Dibuat', render: (p) => formatDateShort(p.created_at) },
  ];
  const noActiveSupplier = !suppliers.some((s) => s.is_active && s.materials.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-cocoa/75">Nilai pembelian adalah informasi, bukan pembukuan atau tagihan supplier.</p>
        <Button size="sm" onClick={() => setCreating(true)} disabled={noActiveSupplier} leftIcon={<Plus size={16} aria-hidden="true" />}>Buat PO</Button>
      </div>
      {noActiveSupplier && <p role="status" className="rounded-btn border border-peach bg-peach/30 px-4 py-3 text-sm text-cocoa">Tambahkan supplier aktif beserta bahannya di tab Supplier sebelum membuat purchase order.</p>}
      {orders.length === 0 ? (
        <div className="card-admin">
          <EmptyState icon={<ClipboardList size={32} aria-hidden="true" />} title="Belum ada purchase order" description="PO baru disimpan sebagai Draft, lalu dipesan ke supplier." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {orders.map((p) => (
              <li key={p.po_id} className="card-admin space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">{open(p)}{status(p)}</div>
                <p className="text-xs text-cocoa/75">{p.supplier_name} · {p.item_count} item · {formatDateShort(p.created_at)}</p>
                <p className="text-sm font-semibold tabular-nums text-cocoa">{formatRupiah(p.order_value)}</p>
              </li>
            ))}
          </ul>
          <div className="card-admin hidden p-1 md:block 2xl:p-3">
            <DataTable label="Daftar purchase order" columns={columns} rows={orders} rowKey={(p) => p.po_id} minWidth="min-w-[760px]" />
          </div>
        </>
      )}
      {creating && <PurchaseOrderFormModal order={null} suppliers={suppliers} onClose={() => setCreating(false)} onSaved={(po, message) => { setCreating(false); onCreated(po, message); }} />}
    </div>
  );
}
