// components/admin/StoreProfileForm.jsx
// Step 5.8 · FR-36 · BR-02 · BR-12 · AD-11 — profil toko (nama, alamat, WhatsApp), batas pre-order, radius & tarif ongkir
// Langsung berlaku: batas jam pre-order (C-09, C-11), radius & ongkir (C-13, C-22), alamat & WhatsApp (C-13, C-18, struk).

import { useState } from 'react';
import { Save } from 'lucide-react';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { normalizeStoreProfile, validateStoreProfile } from '../../utils/businessRules';
import { updateStoreProfile } from '../../services/settingsService';
import { STORE_FIELD_MAX } from '../../constants/settings';

const FIELDS = ['store_name', 'address', 'whatsapp_number', 'preorder_cutoff_time', 'delivery_radius_km', 'delivery_fee_per_km'];

/**
 * @param {object} profile — getStoreSettings().profile
 * @param {Function} onSaved — (message) → void
 */
export default function StoreProfileForm({ profile, onSaved }) {
  const initial = Object.fromEntries(FIELDS.map((f) => [f, profile[f] == null ? '' : String(profile[f])]));
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errors = validateStoreProfile(normalizeStoreProfile(values));
  const errorOf = (f) => (submitted || values[f] !== initial[f] ? errors[f] : undefined);
  const bind = (f) => ({ value: values[f], onChange: (e) => { setValues((v) => ({ ...v, [f]: e.target.value })); setError(''); } });
  const dirty = FIELDS.some((f) => values[f] !== initial[f]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await updateStoreProfile(values);
      onSaved('Profil & aturan operasional disimpan');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="card-admin space-y-4 p-4 md:p-6" aria-labelledby="store-profile-title">
      <h2 id="store-profile-title" className="text-base font-bold text-cocoa">Profil toko & operasional</h2>
      <FormField id="store-name" label="Nama toko" error={errorOf('store_name')}>
        <input className={fieldClass(errorOf('store_name'))} maxLength={STORE_FIELD_MAX.storeName} {...bind('store_name')} />
      </FormField>
      <FormField id="store-address" label="Alamat toko" error={errorOf('address')}>
        <textarea className={fieldClass(errorOf('address'), 'textarea')} maxLength={STORE_FIELD_MAX.address} {...bind('address')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="store-whatsapp" label="Nomor WhatsApp" error={errorOf('whatsapp_number')} hint="Diawali +62">
          <input type="tel" inputMode="tel" className={`${fieldClass(errorOf('whatsapp_number'))} tabular-nums`} maxLength={STORE_FIELD_MAX.whatsapp} {...bind('whatsapp_number')} />
        </FormField>
        <FormField id="store-cutoff" label="Batas jam pre-order" error={errorOf('preorder_cutoff_time')} hint="Lewat jam ini, pre-order H-1 mundur sehari">
          <input type="time" className={fieldClass(errorOf('preorder_cutoff_time'))} {...bind('preorder_cutoff_time')} />
        </FormField>
        <FormField id="store-radius" label="Radius delivery (km)" error={errorOf('delivery_radius_km')}>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" className={`${fieldClass(errorOf('delivery_radius_km'))} tabular-nums`} {...bind('delivery_radius_km')} />
        </FormField>
        <FormField id="store-fee" label="Tarif ongkir per km (Rp)" error={errorOf('delivery_fee_per_km')} hint="Ongkir = jarak dibulatkan ke atas × tarif">
          <input type="number" inputMode="numeric" min="0" step="1" className={`${fieldClass(errorOf('delivery_fee_per_km'))} tabular-nums`} {...bind('delivery_fee_per_km')} />
        </FormField>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={error} />
        <Button type="submit" size="sm" loading={saving} disabled={!dirty} leftIcon={<Save size={16} aria-hidden="true" />}>Simpan profil</Button>
      </div>
    </form>
  );
}
