// components/customer/DaftarForm.jsx
// FR-01 · UC-01 · C-03 Daftar — field nama, email, HP (+62), kata sandi + indikator kekuatan, S&K

import { User, Mail, Phone } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import FormError from '../ui/FormError';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import TermsCheckbox from './TermsCheckbox';
import { PASSWORD_MIN_LENGTH } from '../../constants/auth';

/**
 * Form presentasional — state & validasi dikelola DaftarPage.
 * @param {(field:string) => (e:Event) => void} onFieldChange
 */
export default function DaftarForm({
  form,
  errors,
  agreeTerms,
  onAgreeTermsChange,
  onFieldChange,
  onSubmit,
  submitError,
  loading,
  canSubmit,
}) {
  return (
    <form id="daftar-form" onSubmit={onSubmit} noValidate className="space-y-4">
      <Input
        id="daftar-name"
        label="Nama Lengkap"
        type="text"
        placeholder="Nama kamu"
        value={form.name}
        onChange={onFieldChange('name')}
        error={errors.name}
        leftIcon={<User size={18} />}
        autoComplete="name"
        required
      />

      <Input
        id="daftar-email"
        label="Email"
        type="email"
        placeholder="email@contoh.com"
        value={form.email}
        onChange={onFieldChange('email')}
        error={errors.email}
        leftIcon={<Mail size={18} />}
        autoComplete="email"
        autoCapitalize="none"
        required
      />

      <Input
        id="daftar-phone"
        label="Nomor HP"
        type="tel"
        placeholder="+628xxxxxxxxxx"
        value={form.phone}
        onChange={onFieldChange('phone')}
        error={errors.phone}
        leftIcon={<Phone size={18} />}
        autoComplete="tel"
        required
      />

      <div>
        <PasswordInput
          id="daftar-password"
          label="Kata Sandi"
          placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
          value={form.password}
          onChange={onFieldChange('password')}
          error={errors.password}
          autoComplete="new-password"
          required
        />
        <PasswordStrengthMeter id="daftar-password-strength" password={form.password} />
      </div>

      <TermsCheckbox checked={agreeTerms} onChange={onAgreeTermsChange} />

      <FormError id="daftar-submit-error" message={submitError} />

      <Button
        id="daftar-submit-btn"
        type="submit"
        fullWidth
        loading={loading}
        disabled={!canSubmit}
        className="mt-2"
      >
        Daftar
      </Button>
    </form>
  );
}
