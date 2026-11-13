// components/admin/ReasonModal.jsx
// CR-04a CP6 · BR-21, BR-30 · AD-07 · AD-12 — konfirmasi aksi dokumen dengan alasan: pembalik penerimaan/stok masuk
// (alasan wajib 1 – 255) dan pembatalan PO (alasan opsional ≤ 255). Validasi = aturan murni purchasing.reasonError.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { reasonError } from '../../utils/rules/purchasing';
import useRequestId from '../../hooks/useRequestId';

/**
 * @param {string} title
 * @param {React.ReactNode} children — penjelasan akibat aksi
 * @param {string} confirmLabel
 * @param {boolean} [required] — alasan wajib
 * @param {Function} onConfirm — async (reason, requestId) → void; error ditampilkan di modal. request_id dipakai ulang bila
 *   konfirmasi diulang setelah gagal (BR-31), diganti bila alasan diubah
 * @param {Function} onClose
 */
export default function ReasonModal({ title, children, confirmLabel, required = true, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { requestId, renew } = useRequestId();
  const invalid = reasonError(reason, { required });
  const confirm = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (invalid) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim(), requestId);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal isOpen size="sm" onClose={busy ? undefined : onClose} title={title}
      footer={(<><Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Batal</Button><Button type="submit" form="reason-form" variant="danger" size="sm" loading={busy}>{confirmLabel}</Button></>)}>
      <form id="reason-form" noValidate className="space-y-3 text-sm text-cocoa/80" onSubmit={confirm}>
        {children}
        <FormField id="reason-input" label="Alasan" optional={!required} error={submitted ? invalid : undefined}>
          <textarea className={fieldClass(submitted ? invalid : undefined, 'textarea')} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); renew(); }} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
