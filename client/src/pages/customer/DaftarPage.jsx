// pages/customer/DaftarPage.jsx
// C-03 · Daftar (Register)
// Step 3 · Authentication
// FR-01 · Daftar akun pelanggan; setelah berhasil langsung masuk (FR-01) dan gabung keranjang
// Validation rules SPEC §6: email valid; HP diawali +62; unik; sandi ≥ 8; S&K dicentang

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User, Mail, Phone, Lock } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { register } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { CUSTOMER_ROUTES } from '../../constants/routes';

// ── Fungsi validasi per field ─────────────────────────────────────────────────

function validateEmail(val) {
  if (!val.trim()) return 'Email wajib diisi';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(val.trim())) return 'Format email tidak valid';
  return '';
}

function validatePhone(val) {
  if (!val.trim()) return 'Nomor HP wajib diisi';
  if (!val.trim().startsWith('+62')) return 'Nomor HP harus diawali +62';
  const digitsOnly = val.replace(/\D/g, '');
  if (digitsOnly.length < 9 || digitsOnly.length > 13) return 'Nomor HP tidak valid';
  return '';
}

function validatePassword(val) {
  if (!val) return 'Kata sandi wajib diisi';
  if (val.length < 8) return 'Kata sandi minimal 8 karakter';
  return '';
}

function validateConfirm(val, password) {
  if (!val) return 'Konfirmasi kata sandi wajib diisi';
  if (val !== password) return 'Kata sandi tidak cocok';
  return '';
}

export default function DaftarPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { mergeGuestCart } = useCartStore();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
    // Validasi inline saat pengguna mengetik (setelah field pernah disentuh)
    setErrors((prev) => {
      const next = { ...prev };
      switch (field) {
        case 'email':
          next.email = validateEmail(val);
          break;
        case 'phone':
          next.phone = validatePhone(val);
          break;
        case 'password':
          next.password = validatePassword(val);
          // Re-validate confirm jika sudah diisi
          if (form.confirmPassword) next.confirmPassword = validateConfirm(form.confirmPassword, val);
          break;
        case 'confirmPassword':
          next.confirmPassword = validateConfirm(val, form.password);
          break;
        default:
          break;
      }
      return next;
    });
    setSubmitError('');
  };

  const validate = () => {
    const e = {
      name: form.name.trim() ? '' : 'Nama wajib diisi',
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
      confirmPassword: validateConfirm(form.confirmPassword, form.password),
    };
    setErrors(e);
    return Object.values(e).every((v) => !v);
  };

  const isFormValid =
    form.name.trim() &&
    !validateEmail(form.email) &&
    !validatePhone(form.phone) &&
    !validatePassword(form.password) &&
    form.confirmPassword === form.password &&
    agreeTerms;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || !agreeTerms) return;
    setLoading(true);
    setSubmitError('');
    try {
      const { user, token } = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      });
      // FR-01: setelah daftar langsung masuk
      setAuth(user, token);
      // FR-04: gabung keranjang tamu
      mergeGuestCart(user.user_id);
      navigate(CUSTOMER_ROUTES.BERANDA, { replace: true });
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-8 w-full max-w-sm mx-auto">

      {/* Header */}
      <div className="mb-7">
        <h1 className="font-display text-3xl text-cocoa mb-1">Buat Akun</h1>
        <p className="text-sm text-cocoa/60">Daftar gratis, mulai pesan sekarang</p>
      </div>

      {/* Form */}
      <form id="daftar-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          id="daftar-name"
          label="Nama Lengkap"
          type="text"
          placeholder="Nama kamu"
          value={form.name}
          onChange={handleChange('name')}
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
          onChange={handleChange('email')}
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
          onChange={handleChange('phone')}
          error={errors.phone}
          leftIcon={<Phone size={18} />}
          autoComplete="tel"
          required
        />

        <Input
          id="daftar-password"
          label="Kata Sandi"
          type={showPassword ? 'text' : 'password'}
          placeholder="Minimal 8 karakter"
          value={form.password}
          onChange={handleChange('password')}
          error={errors.password}
          leftIcon={<Lock size={18} />}
          rightIcon={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          autoComplete="new-password"
          required
        />

        <Input
          id="daftar-confirm-password"
          label="Konfirmasi Kata Sandi"
          type={showConfirm ? 'text' : 'password'}
          placeholder="Ulangi kata sandi"
          value={form.confirmPassword}
          onChange={handleChange('confirmPassword')}
          error={errors.confirmPassword}
          leftIcon={<Lock size={18} />}
          rightIcon={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Sembunyikan konfirmasi' : 'Tampilkan konfirmasi'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          autoComplete="new-password"
          required
        />

        {/* Syarat & Ketentuan */}
        <label
          htmlFor="daftar-agree-terms"
          className="flex items-start gap-3 cursor-pointer select-none"
        >
          <input
            id="daftar-agree-terms"
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 w-[18px] h-[18px] accent-primary rounded shrink-0"
            aria-required="true"
          />
          <span className="text-sm text-cocoa/70 leading-snug">
            Saya menyetujui{' '}
            <span className="text-primary font-semibold">Syarat &amp; Ketentuan</span> dan{' '}
            <span className="text-primary font-semibold">Kebijakan Privasi</span> Oven &amp; Co.
          </span>
        </label>

        {/* Error submit */}
        {submitError && (
          <p id="daftar-submit-error" role="alert" className="text-sm text-error flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span> {submitError}
          </p>
        )}

        <Button
          id="daftar-submit-btn"
          type="submit"
          fullWidth
          loading={loading}
          disabled={!isFormValid}
          className="mt-2"
        >
          Daftar
        </Button>
      </form>

      {/* Link masuk */}
      <p className="text-center text-sm text-cocoa/60 mt-6">
        Sudah punya akun?{' '}
        <Link to={CUSTOMER_ROUTES.MASUK} className="text-primary font-semibold hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
