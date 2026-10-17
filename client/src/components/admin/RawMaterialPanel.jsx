// components/admin/RawMaterialPanel.jsx
// Step 5.7 · FR-32 · UC-24 · AD-07 — tab "Bahan Baku": bahan, satuan, stok, minimum, status (Aman/Menipis/Habis),
// tombol "Catat Stok Masuk", ubah, dan tambah bahan. Tabel di ≥ md, kartu di < md.

import { useState } from 'react';
import { AlertTriangle, PackagePlus, Pencil, Plus, Wheat } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import RawMaterialFormModal from './RawMaterialFormModal';
import StockInModal from './StockInModal';
import { MATERIAL_STATUS } from '../../constants/adminCatalog';
import { formatNumber } from '../../utils/format';

const STATUS_BY_KEY = Object.fromEntries(Object.values(MATERIAL_STATUS).map((s) => [s.key, s]));
const actionClass =
  'inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold ' +
  'text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

/**
 * @param {{rows, summary}} board — dari getRawMaterials
 * @param {Function} onChanged — (message) → void, setelah data berubah
 */
export default function RawMaterialPanel({ board, onChanged }) {
  const [editing, setEditing] = useState(null); // { material|null }
  const [stockIn, setStockIn] = useState(null);
  const { rows, summary } = board;
  const attention = summary.menipis + summary.habis;

  const actions = (m) => (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={actionClass} onClick={() => setStockIn(m)} aria-label={`Catat stok masuk ${m.name}`}>
        <PackagePlus size={14} aria-hidden="true" /> Catat Stok Masuk
      </button>
      <button type="button" className={actionClass} onClick={() => setEditing({ material: m })} aria-label={`Ubah ${m.name}`}>
        <Pencil size={14} aria-hidden="true" /> Ubah
      </button>
    </div>
  );
  const status = (m) => <Badge variant={STATUS_BY_KEY[m.status].variant}>{STATUS_BY_KEY[m.status].label}</Badge>;
  const qty = (value, m) => <span className="whitespace-nowrap">{formatNumber(value)} {m.unit}</span>;
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[200px]' },
    { key: 'unit', header: 'Satuan' },
    { key: 'stock', header: 'Stok', align: 'right', render: (m) => qty(m.stock, m) },
    { key: 'min_stock', header: 'Minimum', align: 'right', render: (m) => qty(m.min_stock, m) },
    { key: 'status', header: 'Status', render: status },
    { key: 'action', header: 'Aksi', align: 'right', render: actions },
  ];
  const done = (message) => { setEditing(null); setStockIn(null); onChanged(message); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-2 text-sm" aria-label="Ringkasan status bahan baku">
          {Object.values(MATERIAL_STATUS).map((s) => (
            <li key={s.key}><Badge variant={s.variant}>{s.label}: {summary[s.key]}</Badge></li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" onClick={() => setEditing({ material: null })} leftIcon={<Plus size={16} aria-hidden="true" />}>
          Tambah Bahan
        </Button>
      </div>

      {attention > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-btn border border-peach bg-peach/30 px-4 py-3 text-sm text-cocoa">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          {attention} bahan baku berada pada atau di bawah batas minimum. Catat stok masuk setelah bahan dibeli.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card-admin">
          <EmptyState icon={<Wheat size={32} aria-hidden="true" />} title="Belum ada bahan baku" description="Tambahkan bahan baku utama beserta batas minimumnya." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((m) => (
              <li key={m.material_id} className="card-admin space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-cocoa">{m.name}</p>
                  {status(m)}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-cocoa/60">Stok</dt><dd className="font-semibold tabular-nums text-cocoa">{qty(m.stock, m)}</dd></div>
                  <div><dt className="text-cocoa/60">Minimum</dt><dd className="font-semibold tabular-nums text-cocoa">{qty(m.min_stock, m)}</dd></div>
                </dl>
                <div className="border-t border-beige pt-2">{actions(m)}</div>
              </li>
            ))}
          </ul>
          <div className="card-admin hidden p-1 md:block 2xl:p-3">
            <DataTable label="Daftar bahan baku" columns={columns} rows={rows} rowKey={(m) => m.material_id} minWidth="min-w-[760px]" />
          </div>
        </>
      )}

      {editing && <RawMaterialFormModal material={editing.material} materials={rows} onClose={() => setEditing(null)} onSaved={done} />}
      {stockIn && <StockInModal material={stockIn} onClose={() => setStockIn(null)} onSaved={done} />}
    </div>
  );
}
