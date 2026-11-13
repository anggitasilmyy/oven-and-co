// components/admin/SupplierPanel.jsx
// CR-04a CP6 · FR-41 · UC-33 · BR-17 · AD-12 tab Supplier (Staf & Owner) — daftar supplier (kontak, bahan, status),
// tambah, ubah, aktif/nonaktif (tanpa hapus; nonaktif perlu konfirmasi). Tabel di ≥ md, kartu di < md.

import { useState } from 'react';
import { Pencil, Plus, Power, Truck } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import SupplierFormModal from './SupplierFormModal';
import ConfirmActionModal from './ConfirmActionModal';
import { setSupplierActive } from '../../services/purchasingService';

const actionClass =
  'inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold ' +
  'text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

/**
 * @param {Array} suppliers — dari getSuppliers
 * @param {Array} materials — master bahan AD-07
 * @param {Function} onChanged — (message) → void
 */
export default function SupplierPanel({ suppliers, materials, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const done = (message) => { setEditing(null); setDeactivating(null); onChanged(message); };
  const toggle = async (s) => {
    const saved = await setSupplierActive(s.supplier_id, !s.is_active);
    done(`Supplier ${saved.name} ${saved.is_active ? 'diaktifkan' : 'dinonaktifkan'}`);
  };

  const status = (s) => <Badge variant={s.is_active ? 'ready' : 'neutral'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Badge>;
  const materialText = (s) => (s.materials.length ? s.materials.map((m) => m.name).join(', ') : 'Belum ada bahan');
  const actions = (s) => (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={actionClass} onClick={() => setEditing({ supplier: s })} aria-label={`Ubah ${s.name}`}>
        <Pencil size={14} aria-hidden="true" /> Ubah
      </button>
      <button type="button" className={actionClass} onClick={() => (s.is_active ? setDeactivating(s) : toggle(s).catch((err) => onChanged(err.message, 'error')))}
        aria-label={`${s.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${s.name}`}>
        <Power size={14} aria-hidden="true" /> {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
      </button>
    </div>
  );
  const columns = [
    { key: 'name', header: 'Supplier', className: 'font-semibold min-w-[180px]' },
    { key: 'contact', header: 'Kontak', render: (s) => <span className="text-xs">{s.contact_person}<br />{s.phone}<br />{s.email}</span> },
    { key: 'materials', header: 'Bahan', render: (s) => <span className="text-xs">{materialText(s)}</span>, className: 'max-w-[260px]' },
    { key: 'status', header: 'Status', render: status },
    { key: 'action', header: 'Aksi', align: 'right', render: actions },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEditing({ supplier: null })} leftIcon={<Plus size={16} aria-hidden="true" />}>Tambah Supplier</Button>
      </div>
      {suppliers.length === 0 ? (
        <div className="card-admin">
          <EmptyState icon={<Truck size={32} aria-hidden="true" />} title="Belum ada supplier" description="Tambahkan supplier beserta bahan yang dipasoknya sebelum membuat purchase order." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {suppliers.map((s) => (
              <li key={s.supplier_id} className="card-admin space-y-2 p-4">
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-cocoa">{s.name}</p>{status(s)}</div>
                <p className="text-xs text-cocoa/75">{s.contact_person} · {s.phone}</p>
                <p className="text-xs text-cocoa/75">{materialText(s)}</p>
                <div className="border-t border-beige pt-2">{actions(s)}</div>
              </li>
            ))}
          </ul>
          <div className="card-admin hidden p-1 md:block 2xl:p-3">
            <DataTable label="Daftar supplier" columns={columns} rows={suppliers} rowKey={(s) => s.supplier_id} minWidth="min-w-[820px]" />
          </div>
        </>
      )}
      {editing && <SupplierFormModal supplier={editing.supplier} materials={materials} onClose={() => setEditing(null)} onSaved={done} />}
      {deactivating && (
        <ConfirmActionModal title="Nonaktifkan supplier?" confirmLabel="Nonaktifkan" onConfirm={() => toggle(deactivating)} onClose={() => setDeactivating(null)}>
          <p><span className="font-semibold text-cocoa">{deactivating.name}</span> tidak dapat dipakai untuk purchase order baru. Data dan PO lama tetap tersimpan; supplier dapat diaktifkan kembali.</p>
        </ConfirmActionModal>
      )}
    </div>
  );
}
