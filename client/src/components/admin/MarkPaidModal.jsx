// components/admin/MarkPaidModal.jsx
// Step 5.6 · FR-28 · BR-05 · AD-04 — konfirmasi pembayaran Bayar di Toko diterima

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import { formatRupiah } from '../../utils/format';

/**
 * @param {string} orderNumber
 * @param {number} total
 * @param {Function} onConfirm — async; lempar Error bila ditolak service
 * @param {Function} onClose
 */
export default function MarkPaidModal({ orderNumber, total, onConfirm, onClose }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={pending ? undefined : onClose}
      title="Tandai pembayaran lunas?"
      size="sm"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>Batal</Button>
          <Button size="sm" onClick={confirm} loading={pending}>Ya, Sudah Dibayar</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p>
          Pastikan pelanggan sudah membayar <span className="font-bold text-cocoa tabular-nums">{formatRupiah(total)}</span> di
          toko untuk pesanan <span className="font-mono font-semibold text-cocoa">{orderNumber}</span>.
        </p>
        <p>Setelah ditandai lunas, pesanan bisa diselesaikan.</p>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
