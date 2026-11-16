// components/admin/OutputCorrectionModal.jsx
// CR-04b · FR-46 · UC-37 · BR-27, BR-30 · AD-13 — "Koreksi hasil": jumlah hasil yang benar (bilangan bulat 0 – 10.000) +
// alasan wajib. Server menentukan dokumen yang dibuat (§8.2: 0→q pengganti saja; p→q pembalik + pengganti; p→0 pembalik
// saja). Dokumen asal tetap tersimpan; stok produk siap jual tidak berubah (K13).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { parseWorkOrderQty } from '../../utils/rules/workOrder';
import { reasonError } from '../../utils/rules/purchasing';
import { reverseOrCorrectOutput } from '../../services/workOrderService';
import useRequestId from '../../hooks/useRequestId';
import { WO_QTY_MAX } from '../../constants/workOrder';

/**
 * @param {object} output — dokumen hasil yang berlaku {output_id, qty_output}
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function OutputCorrectionModal({ output, onClose, onSaved }) {
  const [qty, setQty] = useState(String(output.qty_output));
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const qtyError = parseWorkOrderQty(qty.trim(), { min: 0 }).error;
  const errors = { ...(qtyError ? { qty_output: qtyError } : {}), ...(reasonError(reason) ? { reason: reasonError(reason) } : {}) };
  const all = { ...errors, ...serverErrors };
  const errorOf = (k) => (submitted || serverErrors[k] ? all[k] : undefined);
  const touch = () => { setServerErrors({}); setError(''); renew(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await reverseOrCorrectOutput(output.output_id, { qty_output: Number(qty.trim()), reason: reason.trim() }, requestId, { correct: true });
      onSaved(`Hasil produksi dikoreksi menjadi ${qty.trim()}`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="sm" onClose={saving ? undefined : onClose} title={`Koreksi hasil #${output.output_id}`}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button><Button type="submit" form="output-form" size="sm" loading={saving}>Simpan koreksi</Button></>)}>
      <form id="output-form" noValidate className="space-y-4 text-sm text-cocoa/80" onSubmit={submit}>
        <p>Hasil tercatat {output.qty_output}. Dokumen asal tetap tersimpan sebagai riwayat; stok produk siap jual tidak berubah.</p>
        <FormField id="output-qty" label="Jumlah hasil yang benar" hint={`Bilangan bulat 0 – ${WO_QTY_MAX.toLocaleString('id-ID')}`} error={errorOf('qty_output')}>
          <input inputMode="numeric" className={`${fieldClass(errorOf('qty_output'))} tabular-nums`} value={qty} onChange={(e) => { setQty(e.target.value); touch(); }} />
        </FormField>
        <FormField id="output-reason" label="Alasan koreksi" error={errorOf('reason')}>
          <textarea className={fieldClass(errorOf('reason'), 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
