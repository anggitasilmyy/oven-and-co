// components/customer/CancelOrderModal.jsx
// Step 5.4 · FR-20 · BR-08 · C-18 — konfirmasi pembatalan dengan alasan (orders.cancel_reason)

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import { formatNumber } from '../../utils/format';
import { PAYMENT_STATUS } from '../../constants/orderStatus';
import { CANCEL_REASON_MAX_LENGTH } from '../../constants/orderHistory';

/**
 * @param {object} order
 * @param {Function} onConfirm — async (reason) → void; lempar error untuk ditampilkan
 */
export default function CancelOrderModal({ isOpen, onClose, order, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setError('');
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reason);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Batalkan pesanan?"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>Kembali</Button>
          <Button variant="danger" onClick={submit} loading={submitting} disabled={!reason.trim()}>Batalkan Pesanan</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="list-disc pl-5 space-y-1">
          <li>Pesanan <span className="font-mono font-semibold">{order.order_number}</span> akan dibatalkan.</li>
          {order.payment_status === PAYMENT_STATUS.PAID && <li>Pembayaran online akan direfund penuh.</li>}
          {order.points_used > 0 && <li>{formatNumber(order.points_used)} poin yang ditukar dikembalikan.</li>}
        </ul>
        <div>
          <label htmlFor="cancel-reason" className="block text-sm font-bold text-cocoa mb-1.5">Alasan pembatalan</label>
          <textarea
            id="cancel-reason"
            rows={3}
            maxLength={CANCEL_REASON_MAX_LENGTH}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mis. salah memilih tanggal ambil"
            className="input h-auto py-3 resize-none"
          />
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
