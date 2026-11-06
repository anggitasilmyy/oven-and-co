// pages/customer/MasukPage.jsx
// C-02 · Masuk (Login)
// Step 3 · Authentication
// FR-02 · UC-02 · Masuk email/HP + sandi atau Google
// Validation rules SPEC §6: "Email/HP atau kata sandi salah"
// Step 2.5 (PR B): split-screen ≥ lg lewat CustomerAuthShell
// Step 6.6 (CP2a): tujuan setelah login dari utils/routeAccess (return path aman sesuai peran)
// Step 6.6 (CP2c): tombol Google tetap tampil; di mode API hanya menampilkan informasi (tanpa request)

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Info } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PasswordInput from '../../components/ui/PasswordInput';
import FormError from '../../components/ui/FormError';
import AuthHeader from '../../components/customer/AuthHeader';
import CustomerAuthShell from '../../components/customer/CustomerAuthShell';
import GoogleLoginButton from '../../components/customer/GoogleLoginButton';
import { login, loginWithGoogle, isGoogleLoginAvailable } from '../../services/authService';
import { GOOGLE_LOGIN_UNAVAILABLE_MESSAGE } from '../../constants/auth';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { getCartOwnerId } from '../../utils/sessionIdentity';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { postLoginTarget } from '../../utils/routeAccess';

export default function MasukPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { mergeGuestCart } = useCartStore();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  // Step 6.6 (CP2c): informasi (bukan error) bila login Google belum tersedia di mode API
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /** Halaman tujuan setelah login (dari ProtectedRoute atau default ke landing role) */
  const returnTo = location.state?.returnTo;

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setError('');
    setInfo('');
  };

  // Step 6.6 (CP2a): return path hanya dipakai bila internal & boleh dibuka peran tersebut; selain itu halaman awal
  // peran (Staf/Owner → admin, pelanggan → Beranda)
  const redirectAfterLogin = (user) => navigate(postLoginTarget(user, returnTo), { replace: true });

  /** Jalankan aksi login, lalu simpan sesi + gabung keranjang tamu (FR-04) */
  const runLogin = async (loginFn, setBusy) => {
    setBusy(true);
    setError('');
    try {
      const { user, token } = await loginFn();
      setAuth(user, token);
      // Step 6.3: id pemilik keranjang dari helper bersama (mock user_id / API userId)
      mergeGuestCart(getCartOwnerId(user));
      redirectAfterLogin(user);
    } catch (err) {
      // Pesan error persis sesuai SPEC §6
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.identifier.trim() || !form.password) return;
    runLogin(() => login(form.identifier.trim(), form.password), setLoading);
  };

  const handleGoogle = () => {
    // Mode API: tanpa request ke endpoint OAuth yang belum ada (SPEC §10) — cukup informasi
    if (!isGoogleLoginAvailable()) {
      setError('');
      setInfo(GOOGLE_LOGIN_UNAVAILABLE_MESSAGE);
      return;
    }
    setInfo('');
    runLogin(loginWithGoogle, setGoogleLoading);
  };

  const isFormValid = form.identifier.trim() && form.password.length >= 1;

  return (
    <CustomerAuthShell>
      <AuthHeader title="Selamat datang" subtitle="Masuk ke akun Oven & Co. kamu" />

      <form id="masuk-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          id="masuk-identifier"
          label="Email atau Nomor HP"
          type="text"
          placeholder="email@contoh.com atau +628xxx"
          value={form.identifier}
          onChange={handleChange('identifier')}
          leftIcon={<Mail size={18} />}
          autoComplete="username"
          autoCapitalize="none"
          required
        />

        <PasswordInput
          id="masuk-password"
          label="Kata Sandi"
          placeholder="Masukkan kata sandi"
          value={form.password}
          onChange={handleChange('password')}
          autoComplete="current-password"
          required
        />

        <FormError id="masuk-error" message={error} />

        <div className="text-right">
          <Link
            to={CUSTOMER_ROUTES.LUPA_SANDI}
            className="text-sm text-primary font-semibold hover:underline"
          >
            Lupa kata sandi?
          </Link>
        </div>

        <Button
          id="masuk-submit-btn"
          type="submit"
          fullWidth
          loading={loading}
          disabled={!isFormValid}
        >
          Masuk
        </Button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-beige" />
        <span className="text-xs text-cocoa/40 font-medium">atau</span>
        <div className="flex-1 h-px bg-beige" />
      </div>

      <GoogleLoginButton onClick={handleGoogle} loading={googleLoading} />
      {info && (
        <p id="masuk-google-info" role="status" className="mt-3 flex items-start gap-1.5 text-sm text-cocoa/75">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {info}
        </p>
      )}

      <p className="text-center text-sm text-cocoa/60 mt-6">
        Belum punya akun?{' '}
        <Link to={CUSTOMER_ROUTES.DAFTAR} className="text-primary font-semibold hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </CustomerAuthShell>
  );
}
