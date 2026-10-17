// components/customer/ChangePasswordForm.jsx
// Step 5.5 · FR-24 · TF-15 · C-20 Ubah Profil — ubah kata sandi (minimal 8 karakter, SPEC §10).

import { useState } from 'react';
import PasswordInput from '../ui/PasswordInput';
import Button from '../ui/Button';
import FormError from '../ui/FormError';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import { validatePassword } from '../../utils/authValidation';

const EMPTY = { current: '', next: '', confirm: '' };

/** @param {Function} onSubmit — async ({currentPassword, newPassword}) → void; lempar error untuk ditampilkan */
export default function ChangePasswordForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const nextError = form.next ? validatePassword(form.next) : '';
  const confirmError = form.confirm && form.confirm !== form.next ? 'Konfirmasi kata sandi tidak sama' : '';
  const ready = form.current && form.next && form.confirm && !nextError && !confirmError;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setSubmitError('');
    try {
      await onSubmit({ currentPassword: form.current, newPassword: form.next });
      setForm(EMPTY);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="card p-5 lg:p-6 space-y-4" aria-labelledby="sandi-title">
      <h2 id="sandi-title" className="font-display text-xl text-cocoa">Ubah Kata Sandi</h2>
      <PasswordInput id="sandi-current" label="Kata sandi saat ini" autoComplete="current-password" value={form.current} onChange={set('current')} />
      <div className="space-y-2">
        <PasswordInput id="sandi-new" label="Kata sandi baru" autoComplete="new-password" value={form.next} onChange={set('next')} error={nextError} hint="Minimal 8 karakter" />
        <PasswordStrengthMeter id="sandi-new-strength" password={form.next} />
      </div>
      <PasswordInput id="sandi-confirm" label="Ulangi kata sandi baru" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={confirmError} />
      <FormError message={submitError} />
      <Button type="submit" variant="secondary" fullWidth loading={saving} disabled={!ready} className="md:w-auto md:px-8">
        Simpan Kata Sandi
      </Button>
    </form>
  );
}
