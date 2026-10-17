// components/admin/CustomOptionFormModal.jsx
// Step 5.7 · FR-31 · AD-06 — modal tambah/ubah opsi custom cake (custom_options: name, description, extra_price)
// Kelompok opsi ditentukan dari tombol "Tambah" kelompok tersebut dan tidak bisa dipindah saat diubah.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { normalizeCustomOptionInput, validateCustomOption } from '../../utils/businessRules';
import { saveCustomOption } from '../../services/adminProductService';
import { CUSTOM_OPTION_GROUP_LABEL, PRODUCT_FIELD_MAX } from '../../constants/adminCatalog';

/**
 * @param {{group: string, option: object|null}} target — option null = tambah opsi baru di `group`
 * @param {Array} options — semua opsi (cek nama ganda)
 * @param {Function} onClose
 * @param {Function} onSaved
 */
export default function CustomOptionFormModal({ target, options, onClose, onSaved }) {
  const { group, option } = target;
  const [values, setValues] = useState({
    name: option?.name ?? '', description: option?.description ?? '', extra_price: String(option?.extra_price ?? 0),
  });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const input = { ...values, option_group: group, is_active: option?.is_active ?? true };
  const errors = validateCustomOption(normalizeCustomOptionInput(input), options, option?.option_id ?? null);
  const errorOf = (f) => ((submitted || touched[f]) ? errors[f] : undefined);
  const bind = (f) => ({
    value: values[f],
    onChange: (e) => { setValues((v) => ({ ...v, [f]: e.target.value })); setError(''); },
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
  });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await saveCustomOption(option?.option_id ?? null, input);
      onSaved(option ? 'Opsi diperbarui' : 'Opsi ditambahkan');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? undefined : onClose}
      title={`${option ? 'Ubah' : 'Tambah'} opsi ${CUSTOM_OPTION_GROUP_LABEL[group]}`}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="custom-option-form" size="sm" loading={saving}>Simpan opsi</Button>
        </>
      )}
    >
      <form id="custom-option-form" noValidate className="space-y-4" onSubmit={submit}>
        <FormField id="option-name" label="Nama opsi" error={errorOf('name')}>
          <input className={fieldClass(errorOf('name'))} maxLength={PRODUCT_FIELD_MAX.optionName} {...bind('name')} />
        </FormField>
        <FormField id="option-description" label="Keterangan" optional error={errorOf('description')} hint="Contoh: 10–14 porsi">
          <input className={fieldClass(errorOf('description'))} maxLength={PRODUCT_FIELD_MAX.optionDescription} {...bind('description')} />
        </FormField>
        <FormField id="option-price" label="Harga tambahan (Rp)" error={errorOf('extra_price')} hint="Isi 0 bila tanpa biaya tambahan.">
          <input type="number" inputMode="numeric" min="0" step="500" className={fieldClass(errorOf('extra_price'))} {...bind('extra_price')} />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
