// components/admin/SupplierFormModal.jsx
// CR-04a CP6 · FR-41 · UC-33 · BR-17 · K02 + T-01, K03 · AD-12 tab Supplier — tambah/ubah supplier: nama, telepon/WA,
// alamat, email, kontak person wajib; catatan opsional; daftar bahan dari master AD-07 (boleh kosong). Validasi = aturan
// murni server (utils/rules/purchasing.validateSupplier); fieldErrors server tampil di field. request_id dipakai ulang
// bila Simpan diulang setelah gagal (BR-31).

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validateSupplier } from '../../utils/rules/purchasing';
import { saveSupplier } from '../../services/purchasingService';
import useRequestId from '../../hooks/useRequestId';

const FIELDS = [
  ['name', 'Nama supplier', 'text'], ['phone', 'Telepon/WhatsApp', 'tel'], ['email', 'Email', 'email'],
  ['contact_person', 'Kontak person', 'text'], ['address', 'Alamat', 'text'],
];

/**
 * @param {object|null} supplier — null = tambah
 * @param {Array<{material_id, name, unit}>} materials — master bahan AD-07
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function SupplierFormModal({ supplier, materials, onClose, onSaved }) {
  const [values, setValues] = useState({
    name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', contact_person: supplier?.contact_person ?? '',
    address: supplier?.address ?? '', note: supplier?.note ?? '', material_ids: (supplier?.materials ?? []).map((m) => String(m.material_id)),
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { requestId, renew } = useRequestId();
  const { errors } = validateSupplier(values, new Set(materials.map((m) => String(m.material_id))));
  const errorOf = (f) => serverErrors[f] || (submitted ? errors[f] : undefined);
  const change = (patch) => { setValues((v) => ({ ...v, ...patch })); setServerErrors({}); setError(''); renew(); };
  const toggle = (id) => change({ material_ids: values.material_ids.includes(id) ? values.material_ids.filter((x) => x !== id) : [...values.material_ids, id] });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const saved = await saveSupplier(supplier?.supplier_id ?? null, values, supplier ? undefined : requestId);
      onSaved(`Supplier ${saved.name} ${supplier ? 'diperbarui' : 'ditambahkan'}`);
    } catch (err) {
      setServerErrors(err.fieldErrors ?? {});
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen size="lg" onClose={saving ? undefined : onClose} title={supplier ? 'Ubah supplier' : 'Tambah supplier'}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="supplier-form" size="sm" loading={saving}>Simpan supplier</Button>
        </>
      )}
    >
      <form id="supplier-form" noValidate className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([f, label, type]) => (
            <FormField key={f} id={`supplier-${f}`} label={label} error={errorOf(f)} className={f === 'address' ? 'sm:col-span-2' : ''}
              hint={f === 'phone' ? 'Awali dengan +62, mis. +6281234567890' : undefined}>
              <input type={type} className={fieldClass(errorOf(f))} value={values[f]} onChange={(e) => change({ [f]: e.target.value })} />
            </FormField>
          ))}
          <FormField id="supplier-note" label="Catatan" optional error={errorOf('note')} className="sm:col-span-2">
            <textarea className={fieldClass(errorOf('note'), 'textarea')} value={values.note} onChange={(e) => change({ note: e.target.value })} />
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-cocoa">Bahan yang dipasok <span className="font-normal text-cocoa/60">(opsional)</span></legend>
          <p className="mb-2 text-xs text-cocoa/65">Purchase order hanya dapat memuat bahan yang dicentang.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {materials.map((m) => (
              <li key={m.material_id}>
                <label className="flex min-h-touch-min cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-cocoa hover:bg-beige/40">
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={values.material_ids.includes(String(m.material_id))} onChange={() => toggle(String(m.material_id))} />
                  {m.name} <span className="text-cocoa/60">({m.unit})</span>
                </label>
              </li>
            ))}
          </ul>
          {Object.keys(serverErrors).filter((k) => k.startsWith('material_ids')).map((k) => <p key={k} className="mt-1 text-xs text-error">{serverErrors[k]}</p>)}
        </fieldset>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
