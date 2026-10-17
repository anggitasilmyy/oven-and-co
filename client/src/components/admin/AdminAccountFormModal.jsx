// components/admin/AdminAccountFormModal.jsx
// Step 5.8 · FR-36 · FR-26 · AD-11 — tambah akun admin (Staf/Owner) dengan aturan validasi Registrasi
// (email valid & unik, HP +62 & unik, kata sandi ≥ 8 karakter). Akun baru langsung bisa masuk di AD-01.

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import PasswordInput from '../ui/PasswordInput';
import FormField from './FormField';
import { fieldClass } from './fieldClass';
import { validateAdminAccount } from '../../utils/businessRules';
import { addAdminAccount } from '../../services/settingsService';
import { ADMIN_ACCOUNT_ROLES, STORE_FIELD_MAX } from '../../constants/settings';
import { ROLES, ROLE_LABEL } from '../../constants/roles';

/**
 * @param {Array} users — semua akun yang diketahui (cek email/HP ganda di sisi form; service memeriksa ulang)
 * @param {Function} onClose
 * @param {Function} onSaved — (message) → void
 */
export default function AdminAccountFormModal({ users, onClose, onSaved }) {
  const [values, setValues] = useState({ name: '', email: '', phone: '+62', password: '', role: ROLES.STAF });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errors = validateAdminAccount(values, users);
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
      const saved = await addAdminAccount(values);
      onSaved(`Akun ${ROLE_LABEL[saved.role]} ${saved.name} ditambahkan`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? undefined : onClose}
      title="Tambah akun admin"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="admin-account-form" size="sm" loading={saving}>Simpan akun</Button>
        </>
      )}
    >
      <form id="admin-account-form" noValidate className="space-y-4" onSubmit={submit}>
        <FormField id="account-name" label="Nama" error={errorOf('name')}>
          <input className={fieldClass(errorOf('name'))} maxLength={STORE_FIELD_MAX.userName} autoComplete="off" {...bind('name')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="account-email" label="Email" error={errorOf('email')}>
            <input type="email" className={fieldClass(errorOf('email'))} maxLength={STORE_FIELD_MAX.email} autoComplete="off" {...bind('email')} />
          </FormField>
          <FormField id="account-phone" label="Nomor HP" error={errorOf('phone')} hint="Diawali +62">
            <input type="tel" inputMode="tel" className={`${fieldClass(errorOf('phone'))} tabular-nums`} autoComplete="off" {...bind('phone')} />
          </FormField>
        </div>
        <PasswordInput id="account-password" label="Kata sandi awal" autoComplete="new-password" error={errorOf('password')} {...bind('password')} />
        <FormField id="account-role" label="Peran" error={errorOf('role')} hint="Owner mendapat akses Dashboard, Laporan, Promo, dan Pengaturan">
          <select className={fieldClass(errorOf('role'))} {...bind('role')}>
            {ADMIN_ACCOUNT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
