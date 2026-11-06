// pages/admin/AdminLoginPage.jsx
// AD-01 · Login Admin (split screen)
// Step 3 · Authentication
// FR-26 · Login admin sesuai peran
// Owner → /admin/dashboard | Staf → /admin/pesanan
// Checkbox "Ingat saya" sesuai UI/UX Spec
// Step 2.5 (PR B): memakai AuthSplitLayout (panel brand ≥ lg, form saja di bawahnya)
// Step 6.6 (CP2a): kembali ke halaman admin asal bila aman & sesuai peran (utils/routeAccess)

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthSplitLayout from '../../components/layout/AuthSplitLayout';
import AdminDemoAccounts from '../../components/admin/AdminDemoAccounts';
import AdminLoginForm from '../../components/admin/AdminLoginForm';
import { login } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { ROLES } from '../../constants/roles';
import { postLoginTarget } from '../../utils/routeAccess';

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
  const location = useLocation();
  // Step 6.6 (CP2a): halaman admin yang dibuka sebelum login / saat sesi berakhir (diisi ProtectedRoute & RoleRoute)
  const returnTo = location.state?.returnTo;
  const { user, setAuth } = useAuthStore();
  const loadCartForUser = useCartStore((s) => s.loadCartForUser);

  const [form, setForm] = useState(getInitialForm);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Jika sudah login sebagai admin, redirect langsung
  useEffect(() => {
    if (user && (user.role === ROLES.OWNER || user.role === ROLES.STAF)) {
      navigate(postLoginTarget(user, returnTo), { replace: true });
    }
  }, [user, navigate, returnTo]);

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
      // Step 6.3: staf/owner tidak punya keranjang akun → keranjang tamu (helper bersama)
      loadCartForUser(loggedUser);

      // Simpan / hapus identifier berdasarkan "Ingat saya"
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ identifier: form.identifier.trim() }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      // Return path hanya bila boleh dibuka peran ini (mis. Staf tidak kembali ke /admin/laporan milik Owner)
      navigate(postLoginTarget(loggedUser, returnTo), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout subtitle="Admin Panel" brandExtra={<AdminDemoAccounts />}>
      <h1 className="font-display text-3xl text-cocoa mb-1">Masuk Admin</h1>
      <p className="text-sm text-cocoa/70 mb-8">Masukkan kredensial akun admin kamu</p>

      <AdminLoginForm
        form={form}
        onFieldChange={handleChange}
        rememberMe={rememberMe}
        onRememberMeChange={setRememberMe}
        error={error}
        loading={loading}
        onSubmit={handleSubmit}
      />
    </AuthSplitLayout>
  );
}
