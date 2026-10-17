// components/admin/VoucherListPanel.jsx
// Step 5.8 · FR-34 · BR-10 · AD-09 — tabel voucher: kode, judul, jenis, nilai, kuota terpakai, periode, status,
// toggle aktif, Ubah (UI/UX Spec Batch 7). Tabel ≥ md, kartu < md. Voucher tidak dihapus, hanya dinonaktifkan.

import { useState } from 'react';
import { Pencil, Ticket } from 'lucide-react';
import Badge from '../ui/Badge';
import Switch from '../ui/Switch';
import EmptyState from '../ui/EmptyState';
import DataTable from './DataTable';
import { setVoucherActive } from '../../services/adminPromoService';
import { ADMIN_VOUCHER_STATUS, DISCOUNT_TYPE, DISCOUNT_TYPE_LABEL } from '../../constants/adminPromo';
import { formatRupiah, formatNumber, formatDateShort } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const STATUS = Object.fromEntries(Object.values(ADMIN_VOUCHER_STATUS).map((s) => [s.key, s]));
const editClass =
  'inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold ' +
  'text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

const value = (v) => (v.discount_type === DISCOUNT_TYPE.PERCENT ? `${v.discount_value}%` : formatRupiah(v.discount_value));
const period = (v) => `${formatDateShort(parseDateKey(v.valid_from))} – ${formatDateShort(parseDateKey(v.valid_to))}`;
const quota = (v) => `${formatNumber(v.used)} terpakai · sisa ${formatNumber(v.quota)}`;
const status = (v) => <Badge variant={STATUS[v.status].variant}>{STATUS[v.status].label}</Badge>;

/**
 * @param {Array} rows — getAdminVouchers().rows
 * @param {Function} onEdit — (voucher) → void
 * @param {Function} onChanged — (type, message) → void, setelah toggle
 */
export default function VoucherListPanel({ rows, onEdit, onChanged }) {
  const [pendingId, setPendingId] = useState(null);
  const toggle = async (v, checked) => {
    setPendingId(v.voucher_id);
    try {
      await setVoucherActive(v.voucher_id, checked);
      onChanged('success', checked ? `${v.code} diaktifkan` : `${v.code} dinonaktifkan dan tidak bisa dipakai di checkout`);
    } catch (err) {
      onChanged('error', err.message);
    } finally {
      setPendingId(null);
    }
  };
  const activeSwitch = (v) => (
    <Switch checked={v.is_active} disabled={pendingId === v.voucher_id} onChange={(c) => toggle(v, c)} label={`Aktifkan voucher ${v.code}`} />
  );
  const edit = (v) => (
    <button type="button" className={editClass} onClick={() => onEdit(v)} aria-label={`Ubah voucher ${v.code}`}>
      <Pencil size={14} aria-hidden="true" /> Ubah
    </button>
  );
  const columns = [
    { key: 'code', header: 'Kode', render: (v) => <><span className="font-semibold">{v.code}</span><span className="block max-w-[260px] truncate text-xs text-cocoa/65">{v.title}</span></> },
    { key: 'discount_type', header: 'Jenis', render: (v) => DISCOUNT_TYPE_LABEL[v.discount_type] },
    { key: 'discount_value', header: 'Nilai', align: 'right', className: 'tabular-nums font-semibold', render: value },
    { key: 'product', header: 'Berlaku', render: (v) => v.product_name ?? 'Semua produk' },
    { key: 'quota', header: 'Kuota', className: 'whitespace-nowrap tabular-nums text-xs', render: quota },
    { key: 'period', header: 'Periode', className: 'whitespace-nowrap text-xs', render: period },
    { key: 'status', header: 'Status', render: status },
    { key: 'active', header: 'Aktif', render: activeSwitch },
    { key: 'edit', header: 'Aksi', align: 'right', render: edit },
  ];

  if (!rows.length) {
    return <div className="card-admin"><EmptyState icon={<Ticket size={32} aria-hidden="true" />} title="Belum ada voucher" description="Buat voucher pertama untuk promo pelanggan." /></div>;
  }
  return (
    <>
      <ul className="space-y-3 md:hidden" aria-label="Daftar voucher">
        {rows.map((v) => (
          <li key={v.voucher_id} className="card-admin space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-semibold text-cocoa">{v.code} · {value(v)}</p><p className="text-xs text-cocoa/70">{v.title}</p></div>
              {status(v)}
            </div>
            <p className="text-xs text-cocoa/70">{v.product_name ?? 'Semua produk'} · {period(v)}</p>
            <p className="text-xs tabular-nums text-cocoa/70">{quota(v)}</p>
            <div className="flex items-center justify-between border-t border-beige pt-2">{activeSwitch(v)}{edit(v)}</div>
          </li>
        ))}
      </ul>
      <div className="card-admin hidden p-1 md:block 2xl:p-3">
        <DataTable label="Daftar voucher" columns={columns} rows={rows} rowKey={(v) => v.voucher_id} minWidth="min-w-[1040px]" />
      </div>
    </>
  );
}
