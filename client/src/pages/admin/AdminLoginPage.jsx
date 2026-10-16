// pages/admin/AdminLoginPage.jsx
// AD-01 · Login Admin (split screen)
// Step 3 · Authentication
// FR-26 · Login admin sesuai peran
// Owner → /admin/dashboard | Staf → /admin/pesanan
// Checkbox "Ingat saya" sesuai UI/UX Spec

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ChefHat } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { login } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { ROLE_LANDING, ROLES } from '../../constants/roles';

/** Key localStorage untuk "Ingat saya" */
const REMEMBER_KEY = 'ovenco_admin_remember';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();
  const { loadUserCart } = useCartStore();

  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        const { identifier } = JSON.parse(saved);
        return { identifier: identifier ?? '', password: '' };
      }
    } catch {
      /* abaikan */
    }
    return { identifier: '', password: '' };
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return !!localStorage.getItem(REMEMBER_KEY);
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Jika sudah login sebagai admin, redirect langsung
  useEffect(() => {
    if (user && (user.role === ROLES.OWNER || user.role === ROLES.STAF)) {
      navigate(ROLE_LANDING[user.role], { replace: true });
    }
  }, [user, navigate]);

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
      const { user: loggedUser, token } = await login(form.identifier.trim(), form.password);

      // Pastikan hanya admin (staf/owner) yang bisa masuk melalui halaman ini
      if (loggedUser.role === ROLES.CUSTOMER) {
        throw new Error('Akun ini bukan akun admin.');
      }

      setAuth(loggedUser, token);
      loadUserCart(loggedUser.user_id);

      // Simpan / hapus identifier berdasarkan "Ingat saya"
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ identifier: form.identifier.trim() }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      navigate(ROLE_LANDING[loggedUser.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = form.identifier.trim() && form.password.length >= 1;

  return (
    <div className="min-h-screen flex bg-cocoa">

      {/* ── Panel Kiri — Branding (hanya desktop) ────────────────────────── */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-14 relative overflow-hidden">
        {/* Dekorasi lingkaran */}
        <div className="absolute top-[-80px] left-[-80px] w-[320px] h-[320px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] right-[-60px] w-[240px] h-[240px] rounded-full bg-white/5" />

        <div className="relative z-10 text-center text-cream space-y-5">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-primary/80 flex items-center justify-center mx-auto shadow-lg">
            <ChefHat size={40} className="text-cream" />
          </div>
          <h1 className="font-display text-5xl leading-tight">
            Oven &amp; Co.
          </h1>
          <p className="text-cream/60 italic text-lg">Freshly Baked, Made With Care</p>

          {/* Info akun demo */}
          <div className="mt-10 text-left bg-white/10 rounded-2xl p-5 text-sm text-cream/80 space-y-2 max-w-xs">
            <p className="font-semibold text-cream mb-1">Akun Demo</p>
            <p>👤 Owner: <span className="font-mono">owner@demo.com</span></p>
            <p>👤 Staf: <span className="font-mono">staf@demo.com</span></p>
            <p className="text-cream/50">Sandi: <span className="font-mono">demo1234</span></p>
          </div>
        </div>
      </div>

      {/* ── Panel Kanan — Form Login ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-cream">
        <div className="w-full max-w-sm">

          {/* Header mobile (hanya tampil di mobile) */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ChefHat size={22} className="text-cream" />
            </div>
            <div>
              <p className="font-display text-xl text-cocoa leading-tight">Oven &amp; Co.</p>
              <p className="text-xs text-cocoa/50">Admin Panel</p>
            </div>
          </div>

          <h2 className="font-display text-3xl text-cocoa mb-1">Masuk Admin</h2>
          <p className="text-sm text-cocoa/60 mb-8">Masukkan kredensial akun admin kamu</p>

          <form id="admin-login-form" onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              id="admin-login-identifier"
              label="Email"
              type="text"
              placeholder="email@contoh.com"
              value={form.identifier}
              onChange={handleChange('identifier')}
              leftIcon={<Mail size={18} />}
              autoComplete="username"
              autoCapitalize="none"
              required
            />

            <Input
              id="admin-login-password"
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
                  aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
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
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-[18px] h-[18px] accent-primary rounded"
              />
              <span className="text-sm text-cocoa/70">Ingat saya</span>
            </label>

            {/* Error */}
            {error && (
              <p id="admin-login-error" role="alert" className="text-sm text-error flex items-center gap-1.5">
                <span aria-hidden="true">⚠</span> {error}
              </p>
            )}

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
        </div>
      </div>
    </div>
  );
}
