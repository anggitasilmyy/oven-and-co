// components/admin/MaterialMovementsModal.jsx
// CR-04a CP6 · FR-44 · UC-35 · BR-23, BR-24, BR-30 · AD-07 — "Riwayat mutasi" bahan (buku mutasi, terbaru di atas):
// jenis, perubahan, stok sesudah, waktu, pencatat, dokumen & alasan. Dokumen stok masuk/pengganti yang masih berlaku dapat
// dibalik (alasan wajib) atau dikoreksi; saldo awal & opname tidak (BR-30). Penerimaan PO dibalik/dikoreksi di AD-12.

import { useState } from 'react';
import { History } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import ReasonModal from './ReasonModal';
import StockInCorrectionModal from './StockInCorrectionModal';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMaterialMovements, reverseOrCorrectStockInDocument } from '../../services/stockService';
import { MOVEMENT_TYPE_LABEL, RECEIPT_KIND_LABEL, REVERSIBLE_STOCK_KINDS } from '../../constants/purchasing';
import { formatNumber, formatDateShort } from '../../utils/format';

const time = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/**
 * @param {{material_id, name, unit}} material
 * @param {Function} onClose
 * @param {Function} onChanged — (message) → void, setelah pembalik/koreksi (muat ulang daftar bahan)
 */
export default function MaterialMovementsModal({ material, onClose, onChanged }) {
  const history = useServiceQuery(() => getMaterialMovements(material.material_id), [material.material_id]);
  const [action, setAction] = useState(null); // { type: 'reverse'|'correct', document }
  const done = (message) => { setAction(null); history.reload(); onChanged(message); };
  const rows = history.data ? [...history.data.movements].reverse() : [];
  const unit = history.data?.material.unit ?? material.unit;

  return (
    <>
    {/* Dialog aksi menggantikan dialog riwayat sementara (tanpa dialog bertumpuk); Batal → kembali ke riwayat */}
    <Modal isOpen={!action} size="lg" onClose={onClose} title={`Riwayat mutasi · ${material.name}`}
      footer={<Button variant="secondary" size="sm" onClick={onClose}>Tutup</Button>}>
      {history.error && <ErrorState message={history.error.message || 'Riwayat mutasi gagal dimuat.'} onRetry={history.reload} />}
      {!history.error && !history.data && (
        <div className="space-y-2" aria-busy="true" aria-label="Memuat riwayat mutasi">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="block" className="h-16 w-full" />)}
        </div>
      )}
      {history.data && (
        <div className="space-y-3">
          <p className="text-sm text-cocoa/80">Stok saat ini <span className="font-semibold tabular-nums">{formatNumber(history.data.material.stock)} {unit}</span></p>
          {rows.length === 0 ? (
            <EmptyState icon={<History size={32} aria-hidden="true" />} title="Belum ada mutasi" description="Mutasi tercatat saat stok masuk, penerimaan PO, atau stock opname mengubah stok." />
          ) : (
            <ul className="space-y-2" aria-label="Daftar mutasi stok">
              {rows.map((m) => {
                const d = m.document;
                const actionable = d.source === 'stock_adjustment' && d.effective && REVERSIBLE_STOCK_KINDS.includes(d.kind);
                return (
                  <li key={m.movement_id} className="flex flex-col gap-2 rounded-btn border border-beige p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-cocoa">
                        {MOVEMENT_TYPE_LABEL[m.type]}{' '}
                        <span className={`tabular-nums ${m.qty_change < 0 ? 'text-error' : 'text-cocoa'}`}>{m.qty_change > 0 ? '+' : ''}{formatNumber(m.qty_change)} {unit}</span>
                      </p>
                      <p className="text-xs text-cocoa/75">
                        Stok {formatNumber(m.stock_before)} → <span className="font-semibold tabular-nums">{formatNumber(m.stock_after)}</span> {unit} · {formatDateShort(m.created_at)} {time(m.created_at)}
                        {m.created_by ? ` · ${m.created_by}` : ''}
                      </p>
                      <p className="text-xs text-cocoa/65">
                        {d.source === 'goods_receipt' ? `${RECEIPT_KIND_LABEL[d.kind]} #${d.id} (Pembelian)` : `Dokumen #${d.id}`}
                        {d.source === 'stock_adjustment' && !d.effective ? ' · sudah dibalik/dikoreksi' : ''}
                        {d.reason ? ` · Alasan: ${d.reason}` : ''}
                      </p>
                    </div>
                    {actionable && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setAction({ type: 'correct', document: d })}>Koreksi</Button>
                        <Button size="sm" variant="danger" onClick={() => setAction({ type: 'reverse', document: d })}>Balik</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
      {action?.type === 'correct' && <StockInCorrectionModal document={action.document} unit={unit} onClose={() => setAction(null)} onSaved={done} />}
      {action?.type === 'reverse' && (
        <ReasonModal title={`Balik stok masuk #${action.document.id}?`} confirmLabel="Balik stok masuk" onClose={() => setAction(null)}
          onConfirm={async (reason, requestId) => {
            const result = await reverseOrCorrectStockInDocument(action.document.id, { reason }, requestId, { correct: false });
            done(`Stok masuk dibalik; stok ${result.material.name} kini ${formatNumber(result.material.stock)} ${result.material.unit}`);
          }}>
          <p>Seluruh {formatNumber(action.document.qty)} {unit} pada dokumen ini dikurangkan dari stok. Dokumen asal tetap tersimpan sebagai riwayat.</p>
        </ReasonModal>
      )}
    </>
  );
}
