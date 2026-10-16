// components/admin/AdminLoginForm.jsx
// FR-26 · AD-01 Login Admin — form email, kata sandi, "Ingat saya"

import { Mail } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import FormError from '../ui/FormError';

/** Form presentasional — state & submit dikelola AdminLoginPage. */
export default function AdminLoginForm({
  form,
  onFieldChange,
  rememberMe,
  onRememberMeChange,
  error,
  loading,
  onSubmit,
}) {
  const isFormValid = form.identifier.trim() && form.password.length >= 1;

  return (
    <form id="admin-login-form" onSubmit={onSubmit} noValidate className="space-y-4">
      <Input
        id="admin-login-identifier"
        label="Email"
        type="text"
        placeholder="email@contoh.com"
        value={form.identifier}
        onChange={onFieldChange('identifier')}
        leftIcon={<Mail size={18} />}
        autoComplete="username"
        autoCapitalize="none"
        required
      />

      <PasswordInput
        id="admin-login-password"
        label="Kata Sandi"
        placeholder="Masukkan kata sandi"
        value={form.password}
        onChange={onFieldChange('password')}
        showLabel="Tampilkan"
        hideLabel="Sembunyikan"
        autoComplete="current-password"
        required
      />

      {/* Ingat saya */}
      <label
        htmlFor="admin-remember-me"
        className="flex items-center gap-2.5 cursor-pointer select-none"
      >
        <input
          id="admin-remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => onRememberMeChange(e.target.checked)}
          className="w-[18px] h-[18px] accent-primary rounded"
        />
        <span className="text-sm text-cocoa/70">Ingat saya</span>
      </label>

      <FormError id="admin-login-error" message={error} />

      <Button
        id="admin-login-submit-btn"
        type="submit"
        fullWidth
        loading={loading}
        disabled={!isFormValid}
        className="mt-2"
      >
        Masuk
      </Button>
    </form>
  );
}
