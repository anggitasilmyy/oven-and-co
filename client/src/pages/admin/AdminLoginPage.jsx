// pages/admin/AdminLoginPage.jsx
// AD-01 · Login Admin (split screen)
// Step 3 · Authentication
// FR-26 · Login admin sesuai peran
// Owner → /admin/dashboard | Staf → /admin/pesanan
// Checkbox "Ingat saya" sesuai UI/UX Spec

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat } from 'lucide-react';
import AdminBrandPanel from '../../components/admin/AdminBrandPanel';
import AdminLoginForm from '../../components/admin/AdminLoginForm';
import { login } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { ROLE_LANDING, ROLES } from '../../constants/roles';

/** Key localStorage untuk "Ingat saya" */
const REMEMBER_KEY = 'ovenco_admin_remember';

/** Isi awal form dari identifier yang diingat */
function getInitialForm() {
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
}

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();
  const { loadUserCart } = useCartStore();

  const [form, setForm] = useState(getInitialForm);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
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

  return (
    <div className="min-h-screen flex bg-cocoa">
      <AdminBrandPanel />

      {/* Panel Kanan — Form Login */}
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

          <AdminLoginForm
            form={form}
            onFieldChange={handleChange}
            rememberMe={rememberMe}
            onRememberMeChange={setRememberMe}
            error={error}
            loading={loading}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
