// components/admin/PurchaseOrderDetail.jsx
// CR-04a CP6 · FR-42, FR-43 · UC-34, UC-35 · BR-19 – BR-22, BR-30 · AD-12 detail PO — status, item (dipesan, diterima
// bersih, sisa, dibatalkan, nilai baris), nilai PO/penerimaan/sisa dibatalkan (informasi), riwayat dokumen penerimaan,
// dan aksi sesuai status: Draft → Ubah, Pesan, Batalkan; Dipesan/Diterima Sebagian → Terima barang, Batalkan; dokumen
// penerimaan berlaku → Balik / Koreksi. 409 (status/data berubah) → pesan + muat ulang.

import { useState } from 'react';
import { ArrowLeft, PackageCheck, Pencil, Send, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from './DataTable';
import ConfirmActionModal from './ConfirmActionModal';
import ReasonModal from './ReasonModal';
import GoodsReceiptModal from './GoodsReceiptModal';
import PurchaseOrderFormModal from './PurchaseOrderFormModal';
import { changePurchaseOrderStatus, reverseOrCorrectReceipt } from '../../services/purchasingService';
import { PO_STATUS, PO_STATUS_META, PO_RECEIVABLE_STATUSES, RECEIPT_KIND_LABEL } from '../../constants/purchasing';
import { formatNumber, formatRupiah, formatDateShort } from '../../utils/format';
import useRequestId from '../../hooks/useRequestId';

const CANCELLABLE = [PO_STATUS.DRAFT, PO_STATUS.DIPESAN, PO_STATUS.DITERIMA_SEBAGIAN];

/**
 * @param {object} order — detail PO (getPurchaseOrder)
 * @param {Array} suppliers — untuk form ubah Draft
 * @param {Function} onBack
 * @param {Function} onChanged — (message, tone?) → void (muat ulang detail & daftar)
 */
export default function PurchaseOrderDetail({ order, suppliers, onBack, onChanged }) {
  const [modal, setModal] = useState(null);
  const { requestId: orderRequestId, renew } = useRequestId(); // pesan PO: dipakai ulang bila konfirmasi diulang setelah gagal
  const close = () => setModal(null);
  const done = (message) => { close(); renew(); onChanged(message); };
  const qty = (v, i) => <span className="whitespace-nowrap tabular-nums">{formatNumber(v)} {i.unit}</span>;
  const columns = [
    { key: 'name', header: 'Bahan', className: 'font-semibold min-w-[160px]' },
    { key: 'qty_ordered', header: 'Dipesan', align: 'right', render: (i) => qty(i.qty_ordered, i) },
    { key: 'net_received', header: 'Diterima', align: 'right', render: (i) => qty(i.net_received, i) },
    { key: 'remaining', header: 'Sisa', align: 'right', render: (i) => qty(i.remaining, i) },
    { key: 'qty_cancelled', header: 'Dibatalkan', align: 'right', render: (i) => qty(i.qty_cancelled, i) },
    { key: 'unit_price', header: 'Harga', align: 'right', render: (i) => <span className="tabular-nums">{formatRupiah(i.unit_price)}</span> },
    { key: 'line_value', header: 'Nilai', align: 'right', render: (i) => <span className="tabular-nums">{formatRupiah(i.line_value)}</span> },
  ];
  const meta = PO_STATUS_META[order.status];
  const itemName = new Map(order.items.map((i) => [i.po_item_id, i]));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex min-h-touch-min items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke daftar PO</button>
      <section className="card-admin space-y-3 p-4 md:p-6" aria-label={`Purchase order ${order.po_number}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-cocoa">{order.po_number}</h2>
            <p className="text-sm text-cocoa/75">{order.supplier_name}{order.ordered_at ? ` · dipesan ${formatDateShort(order.ordered_at)}` : ''}{order.cancelled_at ? ` · dibatalkan ${formatDateShort(order.cancelled_at)}` : ''}</p>
            {order.note && <p className="mt-1 text-sm text-cocoa/75">Catatan: {order.note}</p>}
            {order.cancel_reason && <p className="mt-1 text-sm text-cocoa/75">Alasan batal: {order.cancel_reason}</p>}
          </div>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === PO_STATUS.DRAFT && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'edit' })} leftIcon={<Pencil size={16} aria-hidden="true" />}>Ubah</Button>}
          {order.status === PO_STATUS.DRAFT && <Button size="sm" onClick={() => setModal({ type: 'order' })} leftIcon={<Send size={16} aria-hidden="true" />}>Pesan ke supplier</Button>}
          {PO_RECEIVABLE_STATUSES.includes(order.status) && <Button size="sm" onClick={() => setModal({ type: 'receive' })} leftIcon={<PackageCheck size={16} aria-hidden="true" />}>Terima barang</Button>}
          {CANCELLABLE.includes(order.status) && <Button size="sm" variant="danger" onClick={() => setModal({ type: 'cancel' })} leftIcon={<XCircle size={16} aria-hidden="true" />}>Batalkan PO</Button>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3" aria-label="Nilai pembelian (informasi, bukan akuntansi)">
          {[['Nilai PO', order.values.order_value], ['Nilai diterima', order.values.received_value], ['Nilai sisa dibatalkan', order.values.cancelled_value]].map(([label, value]) => (
            <div key={label} className="rounded-btn bg-beige/40 p-3"><dt className="text-xs text-cocoa/70">{label}</dt><dd className="font-semibold tabular-nums text-cocoa">{formatRupiah(value)}</dd></div>
          ))}
        </dl>
        <DataTable label={`Item ${order.po_number}`} columns={columns} rows={order.items} rowKey={(i) => i.po_item_id} minWidth="min-w-[760px]" />
      </section>

      <section className="card-admin space-y-3 p-4 md:p-6" aria-label="Riwayat penerimaan">
        <h3 className="text-base font-semibold text-cocoa">Riwayat penerimaan</h3>
        {order.receipts.length === 0 ? <p className="text-sm text-cocoa/70">Belum ada penerimaan.</p> : (
          <ul className="space-y-2">
            {order.receipts.map((r) => (
              <li key={r.receipt_id} className="flex flex-col gap-2 rounded-btn border border-beige p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-cocoa">{RECEIPT_KIND_LABEL[r.kind]} #{r.receipt_id} <span className="font-normal text-cocoa/65">· {formatDateShort(r.created_at)}{r.effective ? '' : ' · tidak berlaku lagi'}</span></p>
                  <p className="text-xs text-cocoa/75">{r.lines.map((l) => `${itemName.get(l.po_item_id)?.name ?? l.po_item_id} ${formatNumber(l.qty)}`).join(' · ')}</p>
                  {r.reason && <p className="text-xs text-cocoa/75">Alasan: {r.reason}</p>}
                </div>
                {r.effective && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'correct', receipt: r })}>Koreksi</Button>
                    <Button size="sm" variant="danger" onClick={() => setModal({ type: 'reverse', receipt: r })}>Balik</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal?.type === 'edit' && <PurchaseOrderFormModal order={order} suppliers={suppliers} onClose={close} onSaved={(_, message) => done(message)} />}
      {(modal?.type === 'receive' || modal?.type === 'correct') && <GoodsReceiptModal order={order} receipt={modal.receipt ?? null} onClose={close} onSaved={(_, message) => done(message)} />}
      {modal?.type === 'order' && (
        <ConfirmActionModal title="Pesan ke supplier?" tone="primary" confirmLabel="Pesan" onClose={close}
          onConfirm={async () => { await changePurchaseOrderStatus(order.po_id, { from: order.status, to: PO_STATUS.DIPESAN }, orderRequestId); done(`PO ${order.po_number} dipesan`); }}>
          <p>Setelah dipesan, isi PO tidak dapat diubah. Perubahan pesanan dibuat sebagai PO baru.</p>
        </ConfirmActionModal>
      )}
      {modal?.type === 'cancel' && (
        <ReasonModal title="Batalkan PO?" confirmLabel="Batalkan PO" required={false} onClose={close}
          onConfirm={async (reason, requestId) => { await changePurchaseOrderStatus(order.po_id, { from: order.status, to: PO_STATUS.DIBATALKAN, ...(reason ? { cancel_reason: reason } : {}) }, requestId); done(`PO ${order.po_number} dibatalkan`); }}>
          <p>Sisa yang belum diterima dibatalkan. Penerimaan yang sudah dicatat tetap tersimpan dan stok tidak berubah.</p>
        </ReasonModal>
      )}
      {modal?.type === 'reverse' && (
        <ReasonModal title={`Balik penerimaan #${modal.receipt.receipt_id}?`} confirmLabel="Balik penerimaan" onClose={close}
          onConfirm={async (reason, requestId) => { await reverseOrCorrectReceipt(modal.receipt.receipt_id, { reason }, requestId, { correct: false }); done('Penerimaan dibalik; stok bahan dikurangi'); }}>
          <p>Seluruh jumlah pada dokumen ini dikurangkan dari stok. Dokumen asal tetap tersimpan sebagai riwayat.</p>
        </ReasonModal>
      )}
    </div>
  );
}
