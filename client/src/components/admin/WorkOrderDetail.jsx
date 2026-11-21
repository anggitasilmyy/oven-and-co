// components/admin/WorkOrderDetail.jsx
// CR-04b · FR-45, FR-46 · UC-36, UC-37 · BR-25 – BR-30, BR-36 · K13 · AD-13 detail WO — status, rencana & hasil bersih,
// aksi per status: Draft → Ubah, Mulai produksi (resep dibekukan), Batalkan; Diproses → Catat pengeluaran, Selesaikan WO,
// Batalkan; pemakaian bahan (standar/aktual/selisih); dokumen pengeluaran & hasil (Balik/Koreksi). 409 → pesan + muat ulang.

import { useState } from 'react';
import { ArrowLeft, CheckCircle2, PackageMinus, Pencil, Play, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ConfirmActionModal from './ConfirmActionModal';
import ReasonModal from './ReasonModal';
import WorkOrderFormModal from './WorkOrderFormModal';
import MaterialIssueModal from './MaterialIssueModal';
import WorkOrderCompleteModal from './WorkOrderCompleteModal';
import OutputCorrectionModal from './OutputCorrectionModal';
import WorkOrderUsageTable from './WorkOrderUsageTable';
import WorkOrderDocuments from './WorkOrderDocuments';
import { changeWorkOrderStatus, reverseOrCorrectIssue, reverseOrCorrectOutput } from '../../services/workOrderService';
import { WO_STATUS, WO_STATUS_META, WO_MANUAL_TRANSITIONS } from '../../constants/workOrder';
import { formatNumber, formatDateShort } from '../../utils/format';
import useRequestId from '../../hooks/useRequestId';

/**
 * @param {object} order — detail WO (getWorkOrder)
 * @param {Array} products — untuk form ubah Draft
 * @param {Array} materials — bahan master (pengeluaran)
 * @param {Function} onBack
 * @param {Function} onChanged — (message, tone?) → void (muat ulang detail & daftar)
 */
export default function WorkOrderDetail({ order, products, materials, onBack, onChanged }) {
  const [modal, setModal] = useState(null);
  const start = useRequestId(); // dipakai ulang bila konfirmasi diulang setelah gagal (BR-31)
  const cancel = useRequestId();
  const close = () => setModal(null);
  const done = (message) => { close(); start.renew(); cancel.renew(); onChanged(message); };
  const meta = WO_STATUS_META[order.status];
  const can = (to) => WO_MANUAL_TRANSITIONS[order.status].includes(to);
  const transition = async (to, requestId, message) => { await changeWorkOrderStatus(order.wo_id, { from: order.status, to }, requestId); done(message); };
  const dates = [['dimulai', order.started_at], ['selesai', order.completed_at], ['dibatalkan', order.cancelled_at]].filter(([, d]) => d);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex min-h-touch-min items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke daftar WO</button>
      <section className="card-admin space-y-3 p-4 md:p-6" aria-label={`Work order ${order.wo_number}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-cocoa">{order.wo_number}</h2>
            <p className="text-sm text-cocoa-muted">{order.product_name} · produksi {formatDateShort(order.production_date)}{dates.map(([l, d]) => ` · ${l} ${formatDateShort(d)}`).join('')}</p>
            {order.note && <p className="mt-1 text-sm text-cocoa-muted">Catatan: {order.note}</p>}
          </div>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-btn bg-beige/40 p-3"><dt className="text-xs text-cocoa-muted">Rencana</dt><dd className="font-semibold tabular-nums text-cocoa">{formatNumber(order.qty_planned)}</dd></div>
          <div className="rounded-btn bg-beige/40 p-3"><dt className="text-xs text-cocoa-muted">Hasil bersih</dt><dd className="font-semibold tabular-nums text-cocoa">{order.status === WO_STATUS.SELESAI ? formatNumber(order.net_output) : '–'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {order.status === WO_STATUS.DRAFT && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'edit' })} leftIcon={<Pencil size={16} aria-hidden="true" />}>Ubah</Button>}
          {can(WO_STATUS.DIPROSES) && <Button size="sm" onClick={() => setModal({ type: 'start' })} leftIcon={<Play size={16} aria-hidden="true" />}>Mulai produksi</Button>}
          {order.status === WO_STATUS.DIPROSES && <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'issue' })} leftIcon={<PackageMinus size={16} aria-hidden="true" />}>Catat pengeluaran</Button>}
          {order.status === WO_STATUS.DIPROSES && <Button size="sm" onClick={() => setModal({ type: 'complete' })} leftIcon={<CheckCircle2 size={16} aria-hidden="true" />}>Selesaikan WO</Button>}
          {can(WO_STATUS.DIBATALKAN) && <Button size="sm" variant="danger" onClick={() => setModal({ type: 'cancel' })} leftIcon={<XCircle size={16} aria-hidden="true" />}>Batalkan WO</Button>}
        </div>
      </section>
      <WorkOrderUsageTable order={order} />
      <WorkOrderDocuments order={order} onAction={setModal} />

      {modal?.type === 'edit' && <WorkOrderFormModal order={order} products={products} onClose={close} onSaved={(_, message) => done(message)} />}
      {modal?.type === 'issue' && <MaterialIssueModal order={order} issue={null} materials={materials} onClose={close} onSaved={done} />}
      {modal?.type === 'issue-correct' && <MaterialIssueModal order={order} issue={modal.doc} materials={materials} onClose={close} onSaved={done} />}
      {modal?.type === 'complete' && <WorkOrderCompleteModal order={order} materials={materials} onClose={close} onSaved={done} />}
      {modal?.type === 'output-correct' && <OutputCorrectionModal output={modal.doc} onClose={close} onSaved={done} />}
      {modal?.type === 'start' && (
        <ConfirmActionModal title="Mulai produksi?" tone="primary" confirmLabel="Mulai" onClose={close}
          onConfirm={() => transition(WO_STATUS.DIPROSES, start.requestId, `${order.wo_number} mulai diproses`)}>
          <p>Resep {order.product_name} saat ini dibekukan untuk WO ini. Perubahan resep berikutnya tidak memengaruhi WO ini.</p>
        </ConfirmActionModal>
      )}
      {modal?.type === 'cancel' && (
        <ConfirmActionModal title="Batalkan WO?" tone="danger" confirmLabel="Batalkan WO" onClose={close}
          onConfirm={() => transition(WO_STATUS.DIBATALKAN, cancel.requestId, `${order.wo_number} dibatalkan`)}>
          <p>Pengeluaran bahan yang sudah dicatat tetap berlaku; balik atau koreksi bila bahan dikembalikan.</p>
        </ConfirmActionModal>
      )}
      {modal?.type === 'issue-reverse' && (
        <ReasonModal title={`Balik pengeluaran #${modal.doc.issue_id}?`} confirmLabel="Balik pengeluaran" onClose={close}
          onConfirm={async (reason, requestId) => { await reverseOrCorrectIssue(modal.doc.issue_id, { reason }, requestId, { correct: false }); done('Pengeluaran dibalik; stok bahan dikembalikan'); }}>
          <p>Seluruh bahan pada dokumen ini dikembalikan ke stok. Dokumen asal tetap tersimpan sebagai riwayat.</p>
        </ReasonModal>
      )}
      {modal?.type === 'output-reverse' && (
        <ReasonModal title={`Balik hasil #${modal.doc.output_id}?`} confirmLabel="Balik hasil" onClose={close}
          onConfirm={async (reason, requestId) => { await reverseOrCorrectOutput(modal.doc.output_id, { reason }, requestId, { correct: false }); done('Hasil produksi dibalik'); }}>
          <p>Hasil {formatNumber(modal.doc.qty_output)} dibatalkan sehingga hasil bersih berkurang. Stok produk siap jual tidak berubah.</p>
        </ReasonModal>
      )}
    </div>
  );
}
