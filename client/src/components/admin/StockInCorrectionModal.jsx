// components/admin/StockInCorrectionModal.jsx
// CR-04a CP6 · FR-44 · BR-30 · AD-07 riwayat mutasi — "Koreksi stok masuk": jumlah pengganti (> 0) + alasan wajib.
// Dokumen asal tetap tersimpan; server mencatat pembalik + pengganti dengan satu request_id (mutasi bersih = selisih).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { parseDecimalInput } from '../../utils/rules/decimalInput';
import { reasonError } from '../../utils/rules/purchasing';
import { reverseOrCorrectStockInDocument } from '../../services/stockService';
import useRequestId from '../../hooks/useRequestId';
import { STOCK_QTY_MAX } from '../../constants/purchasing';
import { formatNumber } from '../../utils/format';

const text = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * @param {{id, qty}} document — dokumen stok masuk berlaku (qty = jumlah dokumen asal)
 * @param {string} unit
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function StockInCorrectionModal({ document, unit, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const parsed = parseDecimalInput(text(qty), { max: STOCK_QTY_MAX });
  const qtyError = serverErrors.qty || ((submitted || qty !== '') ? parsed.error : undefined);
  const reasonInvalid = serverErrors.reason || reasonError(reason);
  const touch = () => { setError(''); setServerErrors({}); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (parsed.error || reasonInvalid) return;
    setSaving(true);
    try {
      const result = await reverseOrCorrectStockInDocument(document.id, { qty: text(qty), reason: reason.trim() }, requestId, { correct: true });
      onSaved(`Stok masuk dikoreksi; stok ${result.material.name} kini ${formatNumber(result.material.stock)} ${result.material.unit}`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="sm" onClose={saving ? undefined : onClose} title="Koreksi stok masuk"
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="stock-in-correct-form" size="sm" loading={saving}>Simpan koreksi</Button></>)}>
      <form id="stock-in-correct-form" noValidate className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-cocoa/80">
          Dokumen #{document.id} mencatat <span className="font-semibold tabular-nums">{formatNumber(document.qty)} {unit}</span>. Isi jumlah yang
          benar; dokumen asal tetap tersimpan sebagai riwayat. Untuk membatalkan seluruhnya, gunakan Balik.
        </p>
        <FormField id="stock-in-correct-qty" label={`Jumlah yang benar (${unit})`} error={qtyError}>
          <input inputMode="decimal" autoFocus className={`${fieldClass(qtyError)} tabular-nums`} value={qty} onChange={(e) => { setQty(e.target.value); touch(); }} />
        </FormField>
        <FormField id="stock-in-correct-reason" label="Alasan koreksi" error={submitted ? reasonInvalid : undefined}>
          <textarea className={fieldClass(submitted ? reasonInvalid : undefined, 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
