// components/admin/StatusChangeModal.jsx
// Step 5.6 · FR-28 · AD-04 — modal konfirmasi sebelum menyimpan status (validation rule "Status (admin)")
// Dalam Pengiriman meminta nama kurir (PRD §6.2). Error dari service ditampilkan di modal; status tidak berubah.

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import FormError from '../ui/FormError';
import StatusBadge from '../ui/StatusBadge';
import { ADMIN_STATUS_ACTION, COURIER_NAME_MAX_LENGTH } from '../../constants/adminOrder';

/**
 * @param {string} orderNumber
 * @param {string} from — status saat ini
 * @param {string} to — status tujuan
 * @param {boolean} requiresCourier
 * @param {Function} onConfirm — async ({courierName}) → lempar Error bila ditolak service
 * @param {Function} onClose
 */
export default function StatusChangeModal({ orderNumber, from, to, requiresCourier, onConfirm, onClose }) {
  const [courierName, setCourierName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const action = ADMIN_STATUS_ACTION[to];

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onConfirm({ courierName });
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={pending ? undefined : onClose}
      title="Ubah status pesanan?"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>Batal</Button>
          <Button size="sm" onClick={confirm} loading={pending}>Ya, {action.label}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p>Pesanan <span className="font-mono font-semibold text-cocoa">{orderNumber}</span> akan diubah:</p>
        <div className="flex flex-wrap items-center gap-2" aria-label="Perubahan status">
          <StatusBadge status={from} />
          <ArrowRight size={16} className="text-cocoa/60" aria-hidden="true" />
          <StatusBadge status={to} />
        </div>
        <p>{action.description} Pelanggan menerima notifikasi perubahan ini.</p>
        {requiresCourier && (
          <Input
            id="courier-name-input"
            label="Nama kurir"
            placeholder="Contoh: Pak Joko"
            maxLength={COURIER_NAME_MAX_LENGTH}
            value={courierName}
            onChange={(e) => { setCourierName(e.target.value); setError(''); }}
          />
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}
