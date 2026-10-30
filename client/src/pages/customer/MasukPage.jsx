// pages/customer/MasukPage.jsx
// C-02 · Masuk (Login)
// Step 3 · Authentication
// FR-02 · UC-02 · Masuk email/HP + sandi atau Google
// Validation rules SPEC §6: "Email/HP atau kata sandi salah"
// Step 2.5 (PR B): split-screen ≥ lg lewat CustomerAuthShell

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PasswordInput from '../../components/ui/PasswordInput';
import FormError from '../../components/ui/FormError';
import AuthHeader from '../../components/customer/AuthHeader';
import CustomerAuthShell from '../../components/customer/CustomerAuthShell';
import GoogleLoginButton from '../../components/customer/GoogleLoginButton';
import { login, loginWithGoogle } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { ROLE_LANDING, ROLES } from '../../constants/roles';
import { getCartOwnerId } from '../../utils/sessionIdentity';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function MasukPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { mergeGuestCart } = useCartStore();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /** Halaman tujuan setelah login (dari ProtectedRoute atau default ke landing role) */
  const returnTo = location.state?.returnTo;

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setError('');
  };

  const redirectAfterLogin = (user) => {
    // Admin (staf/owner) → halaman admin
    if (user.role === ROLES.STAF || user.role === ROLES.OWNER) {
      navigate(ROLE_LANDING[user.role], { replace: true });
      return;
    }
    // Pelanggan → returnTo atau beranda
    navigate(returnTo ?? CUSTOMER_ROUTES.BERANDA, { replace: true });
  };

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

  const handleGoogle = () => runLogin(loginWithGoogle, setGoogleLoading);

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

      <p className="text-center text-sm text-cocoa/60 mt-6">
        Belum punya akun?{' '}
        <Link to={CUSTOMER_ROUTES.DAFTAR} className="text-primary font-semibold hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </CustomerAuthShell>
  );
}
