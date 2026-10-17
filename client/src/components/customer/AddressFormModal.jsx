// components/customer/AddressFormModal.jsx
// Step 5.5 · FR-24 · BR-12 · C-22 — form tambah/ubah alamat (PRD Batch 5): Label, Nama penerima, Nomor HP,
// Alamat lengkap, pin peta, Catatan untuk kurir, toggle "Jadikan alamat utama".

import { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Chip from '../ui/Chip';
import FormError from '../ui/FormError';
import MapPinPicker from './MapPinPicker';
import useAddressForm from '../../hooks/useAddressForm';
import { ADDRESS_LABEL_SUGGESTIONS, ADDRESS_LIMITS } from '../../constants/account';

/**
 * @param {object|null} address — null = tambah alamat baru
 * @param {{store, settings}} context — dari addressService.getMyAddresses()
 * @param {{name, phone}} user
 * @param {boolean} firstAddress — belum punya alamat (alamat pertama otomatis utama)
 * @param {Function} onSubmit — async (values) → void; lempar error untuk ditampilkan
 */
export default function AddressFormModal({ address, context, user, firstAddress, onClose, onSubmit }) {
  const { form, set, field, errorOf, validate } = useAddressForm(address, user, firstAddress);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const primaryLocked = firstAddress || Boolean(address?.is_primary);
  const setPin = ({ latitude, longitude }) => {
    set('latitude', latitude);
    set('longitude', longitude);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setSubmitError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      size="lg"
      onClose={() => !saving && onClose()}
      title={address ? 'Ubah Alamat' : 'Tambah Alamat'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="address-form" loading={saving}>Simpan Alamat</Button>
        </>
      }
    >
      <form id="address-form" onSubmit={submit} noValidate className="space-y-4 py-1">
        <div className="space-y-2">
          <Input id="alamat-label" label="Label" placeholder="Mis. Rumah" maxLength={ADDRESS_LIMITS.label} {...field('label')} />
          <div className="flex flex-wrap gap-2" aria-label="Pilihan label">
            {ADDRESS_LABEL_SUGGESTIONS.map((label) => (
              <Chip key={label} selected={form.label === label} onClick={() => set('label', label)}>{label}</Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input id="alamat-penerima" label="Nama penerima" maxLength={ADDRESS_LIMITS.recipient_name} autoComplete="name" {...field('recipient_name')} />
          <Input id="alamat-hp" label="Nomor HP" type="tel" maxLength={ADDRESS_LIMITS.recipient_phone} autoComplete="tel" hint="Diawali +62" {...field('recipient_phone')} />
        </div>
        <div>
          <label htmlFor="alamat-lengkap" className="block text-sm font-semibold text-cocoa mb-1.5">Alamat lengkap</label>
          <textarea
            id="alamat-lengkap"
            rows={3}
            value={form.full_address}
            onChange={(e) => set('full_address', e.target.value)}
            onBlur={field('full_address').onBlur}
            aria-invalid={Boolean(errorOf('full_address'))}
            aria-describedby={errorOf('full_address') ? 'alamat-lengkap-error' : undefined}
            placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, kota"
            className={`input h-auto py-3 resize-none ${errorOf('full_address') ? 'border-error' : ''}`}
          />
          <FormError id="alamat-lengkap-error" message={errorOf('full_address')} className="mt-1.5 text-xs" />
        </div>
        <MapPinPicker
          store={context.store}
          settings={context.settings}
          value={form.latitude != null ? { latitude: form.latitude, longitude: form.longitude } : null}
          onChange={setPin}
          error={errorOf('pin')}
        />
        <Input id="alamat-catatan" label="Catatan untuk kurir (opsional)" maxLength={ADDRESS_LIMITS.courier_note} placeholder="Mis. pagar hitam" {...field('courier_note')} />
        <label className={`flex items-center justify-between gap-4 min-h-touch-min ${primaryLocked ? 'opacity-70' : 'cursor-pointer'}`}>
          <span className="text-sm font-semibold text-cocoa">
            Jadikan alamat utama
            {primaryLocked && <span className="block text-xs font-normal text-cocoa/70">Alamat utama dipilih otomatis bila hanya ada satu alamat atau sudah utama.</span>}
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={primaryLocked || form.is_primary}
            disabled={primaryLocked}
            onChange={(e) => set('is_primary', e.target.checked)}
            className="w-6 h-6 rounded text-primary focus:ring-primary/50"
          />
        </label>
        <FormError message={submitError} />
      </form>
    </Modal>
  );
}
