// components/customer/ProfileForm.jsx
// Step 5.5 · FR-24 · TF-07 · C-20 Ubah Profil — nama, email, nomor HP (aturan Registrasi SPEC §6).
// Error tampil di bawah field setelah field disentuh; tombol Simpan nonaktif sampai valid & ada perubahan.

import { useState } from 'react';
import { User, Mail, Phone } from 'lucide-react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import { validateProfileInput } from '../../utils/businessRules';
import { PROFILE_NAME_MAX } from '../../constants/account';

/**
 * @param {{name, email, phone}} initial — profil saat ini
 * @param {Function} onSubmit — async (values) → void; lempar error untuk ditampilkan
 */
export default function ProfileForm({ initial, onSubmit }) {
  const [form, setForm] = useState({ name: initial.name ?? '', email: initial.email ?? '', phone: initial.phone ?? '' });
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const errors = validateProfileInput(form);
  const changed = ['name', 'email', 'phone'].some((k) => form[k].trim() !== (initial[k] ?? ''));
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    error: touched[key] ? errors[key] : '',
  });

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true });
    if (Object.keys(errors).length) return;
    setSaving(true);
    setSubmitError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="card p-5 lg:p-6 space-y-4" aria-labelledby="profil-title">
      <h2 id="profil-title" className="font-display text-xl text-cocoa">Data Profil</h2>
      <Input id="profil-name" label="Nama lengkap" autoComplete="name" maxLength={PROFILE_NAME_MAX} leftIcon={<User size={18} />} {...field('name')} />
      <Input id="profil-email" label="Email" type="email" autoComplete="email" leftIcon={<Mail size={18} />} {...field('email')} />
      <Input
        id="profil-phone"
        label="Nomor HP"
        type="tel"
        autoComplete="tel"
        placeholder="+628…"
        hint="Diawali +62"
        leftIcon={<Phone size={18} />}
        {...field('phone')}
      />
      <FormError message={submitError} />
      <Button type="submit" fullWidth loading={saving} disabled={!changed || Object.keys(errors).length > 0} className="md:w-auto md:px-8">
        Simpan Perubahan
      </Button>
    </form>
  );
}
