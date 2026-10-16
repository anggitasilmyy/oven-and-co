// pages/customer/MasukPage.jsx
// C-02 · Masuk (Login)
// Step 3 · Authentication
// FR-02 · Masuk email/HP + sandi atau Google
// Validation rules SPEC §6: "Email/HP atau kata sandi salah"

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { login, loginWithGoogle } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { ROLE_LANDING } from '../../constants/roles';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function MasukPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { mergeGuestCart } = useCartStore();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /** Halaman tujuan setelah login (dari ProtectedRoute atau default ke landing role) */
  const returnTo = location.state?.returnTo;

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.identifier.trim() || !form.password) return;
    setLoading(true);
    setError('');
    try {
      const { user, token } = await login(form.identifier.trim(), form.password);
      setAuth(user, token);
      mergeGuestCart(user.user_id);
      redirectAfterLogin(user);
    } catch (err) {
      // Pesan error persis sesuai SPEC §6
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const { user, token } = await loginWithGoogle();
      setAuth(user, token);
      mergeGuestCart(user.user_id);
      redirectAfterLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const redirectAfterLogin = (user) => {
    // Admin (staf/owner) → halaman admin
    if (user.role === 'staf' || user.role === 'owner') {
      navigate(ROLE_LANDING[user.role], { replace: true });
      return;
    }
    // Pelanggan → returnTo atau beranda
    navigate(returnTo ?? CUSTOMER_ROUTES.BERANDA, { replace: true });
  };

  const isFormValid = form.identifier.trim() && form.password.length >= 1;

  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-10 w-full max-w-sm mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-cocoa mb-1">Selamat datang</h1>
        <p className="text-sm text-cocoa/60">Masuk ke akun Oven &amp; Co. kamu</p>
      </div>

      {/* Form */}
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

        <Input
          id="masuk-password"
          label="Kata Sandi"
          type={showPassword ? 'text' : 'password'}
          placeholder="Masukkan kata sandi"
          value={form.password}
          onChange={handleChange('password')}
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
          autoComplete="current-password"
          required
        />

        {/* Error umum */}
        {error && (
          <p id="masuk-error" role="alert" className="text-sm text-error flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}

        {/* Lupa sandi */}
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

      {/* Tombol Google */}
      <button
        id="masuk-google-btn"
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full h-[52px] rounded-btn border border-beige bg-white text-cocoa font-sans font-semibold
                   text-sm flex items-center justify-center gap-3 hover:bg-cream transition-colors
                   active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        aria-label="Masuk dengan Google"
      >
        {googleLoading ? (
          <span className="w-4 h-4 border-2 border-cocoa/40 border-t-transparent rounded-full animate-spin" />
        ) : (
          /* Google "G" icon SVG */
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M44.5 20H24v8.5h11.9C34.2 33.2 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.1-2.7-.5-4z"/>
            <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3 0 5.8 1.1 7.9 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.2 3 9.4 7.8 6.3 14.7z"/>
            <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.7 36 27 37 24 37c-5.6 0-10.2-3.8-11.9-8.9l-7 5.4C8.9 40.8 16 45 24 45z"/>
            <path fill="#EA4335" d="M44.5 20H24v8.5h11.9c-.8 2.3-2.3 4.3-4.3 5.9l6.7 5.5C41.8 36.4 45 30.7 45 24c0-1.4-.1-2.7-.5-4z"/>
          </svg>
        )}
        Masuk dengan Google
      </button>

      {/* Link daftar */}
      <p className="text-center text-sm text-cocoa/60 mt-6">
        Belum punya akun?{' '}
        <Link to={CUSTOMER_ROUTES.DAFTAR} className="text-primary font-semibold hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </div>
  );
}
