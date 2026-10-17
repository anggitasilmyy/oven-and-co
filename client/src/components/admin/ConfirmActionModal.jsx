// components/admin/ConfirmActionModal.jsx
// Step 5.8 · AD-10 · AD-11 — konfirmasi sebelum aksi yang mengurangi akses/tampilan
// (UI/UX Spec Batch 7: "destructive actions require confirmation"), mis. sembunyikan ulasan, nonaktifkan akun.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';

/**
 * @param {string} title
 * @param {React.ReactNode} children — penjelasan akibat aksi
 * @param {string} confirmLabel
 * @param {'primary'|'danger'} [tone]
 * @param {Function} onConfirm — async; error ditampilkan di modal
 * @param {Function} onClose
 */
export default function ConfirmActionModal({ title, children, confirmLabel, tone = 'danger', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      size="sm"
      onClose={busy ? undefined : onClose}
      title={title}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Batal</Button>
          <Button variant={tone} size="sm" onClick={confirm} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-cocoa/80">
        {children}
        <FormError message={error} />
      </div>
    </Modal>
  );
}
