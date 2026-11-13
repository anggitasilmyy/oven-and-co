// components/admin/GoodsReceiptModal.jsx
// CR-04a CP6 · FR-43 · UC-35 · BR-20, BR-21, BR-30 · K05 · AD-12 detail PO — "Terima barang" (sebagian atau penuh, maks.
// sisa per item; kelebihan ditolak) dan "Koreksi penerimaan" (isi pengganti dokumen asal + alasan wajib; item yang
// dikosongkan dihapus dari penerimaan). Baris kosong/0 tidak dikirim. Validasi akhir = server (aturan murni sama).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { reasonError } from '../../utils/rules/purchasing';
import { parseDecimalInput } from '../../utils/rules/decimalInput';
import { receivePurchaseOrder, reverseOrCorrectReceipt } from '../../services/purchasingService';
import useRequestId from '../../hooks/useRequestId';
import { STOCK_QTY_MAX } from '../../constants/purchasing';
import { formatNumber } from '../../utils/format';

const text = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * @param {object} order — detail PO
 * @param {object|null} receipt — dokumen asal (koreksi) atau null (penerimaan baru)
 * @param {Function} onClose
 * @param {Function} onSaved — (result, message) → void
 */
export default function GoodsReceiptModal({ order, receipt, onClose, onSaved }) {
  const correcting = Boolean(receipt);
  const original = new Map((receipt?.lines ?? []).map((l) => [l.po_item_id, l.qty]));
  const [qty, setQty] = useState(Object.fromEntries(order.items.map((i) => [i.po_item_id, original.has(i.po_item_id) ? String(original.get(i.po_item_id)) : ''])));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const lines = order.items.filter((i) => text(qty[i.po_item_id]) !== '' && text(qty[i.po_item_id]) !== '0').map((i) => ({ po_item_id: i.po_item_id, qty: text(qty[i.po_item_id]) }));
  const qtyError = (i) => {
    const v = text(qty[i.po_item_id]);
    if (v === '' || v === '0') return undefined;
    return parseDecimalInput(v, { max: STOCK_QTY_MAX }).error ?? undefined;
  };
  const reasonInvalid = correcting ? reasonError(reason) : reasonError(note, { required: false });
  const invalid = order.items.some(qtyError) || reasonInvalid || (!correcting && lines.length === 0);
  const touch = () => { setError(''); setServerErrors({}); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (invalid) return;
    setSaving(true);
    try {
      const result = correcting
        ? await reverseOrCorrectReceipt(receipt.receipt_id, { lines, reason: reason.trim(), ...(note.trim() ? { note } : {}) }, requestId, { correct: true })
        : await receivePurchaseOrder(order.po_id, { lines, ...(note.trim() ? { note } : {}) }, requestId);
      onSaved(result, correcting ? 'Penerimaan dikoreksi; stok bahan diperbarui' : 'Penerimaan dicatat; stok bahan bertambah');
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={saving ? undefined : onClose} title={correcting ? 'Koreksi penerimaan' : `Terima barang · ${order.po_number}`}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="receipt-form" size="sm" loading={saving}>{correcting ? 'Simpan koreksi' : 'Simpan penerimaan'}</Button></>)}>
      <form id="receipt-form" noValidate className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-cocoa/75">{correcting
          ? 'Isi jumlah yang benar untuk setiap item. Kosongkan item yang seharusnya tidak diterima. Dokumen asal tetap tersimpan sebagai riwayat.'
          : 'Isi jumlah yang datang. Penerimaan boleh sebagian; jumlah tidak boleh melebihi sisa.'}</p>
        <ul className="space-y-3">
          {order.items.map((i, k) => (
            <li key={i.po_item_id} className="grid gap-2 rounded-btn border border-beige p-3 sm:grid-cols-[1fr_160px] sm:items-end">
              <div className="text-sm">
                <p className="font-semibold text-cocoa">{i.name}</p>
                <p className="text-xs text-cocoa/70">Dipesan {formatNumber(i.qty_ordered)} · diterima {formatNumber(i.net_received)} · sisa <span className="font-semibold">{formatNumber(i.remaining)}</span> {i.unit}</p>
              </div>
              <FormField id={`receipt-qty-${i.po_item_id}`} label={`Jumlah (${i.unit})`} error={qtyError(i) || serverErrors[`lines.${k}.qty`]}>
                <input inputMode="decimal" className={`${fieldClass(qtyError(i))} tabular-nums`} value={qty[i.po_item_id]} onChange={(e) => { setQty((q) => ({ ...q, [i.po_item_id]: e.target.value })); touch(); }} />
              </FormField>
            </li>
          ))}
        </ul>
        {submitted && !correcting && lines.length === 0 && <p className="text-xs text-error">Isi minimal satu jumlah yang diterima.</p>}
        {correcting && (
          <FormField id="receipt-reason" label="Alasan koreksi" error={submitted ? reasonInvalid : undefined}>
            <textarea className={fieldClass(submitted ? reasonInvalid : undefined, 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
          </FormField>
        )}
        <FormField id="receipt-note" label="Catatan" optional error={!correcting && submitted ? reasonInvalid : undefined}>
          <input className={fieldClass()} value={note} onChange={(e) => { setNote(e.target.value); touch(); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
