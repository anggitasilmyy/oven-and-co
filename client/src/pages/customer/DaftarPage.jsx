// pages/customer/DaftarPage.jsx
// C-03 · Daftar (Register)
// Step 3 · Authentication
// FR-01 · UC-01 · Daftar akun pelanggan; setelah berhasil langsung masuk dan gabung keranjang (FR-04)
// Validation rules SPEC §6: email valid; HP diawali +62; unik; sandi ≥ 8; S&K dicentang

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthHeader from '../../components/customer/AuthHeader';
import DaftarForm from '../../components/customer/DaftarForm';
import { register } from '../../services/authService';
import useAuthStore from '../../stores/useAuthStore';
import useCartStore from '../../stores/useCartStore';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
} from '../../utils/authValidation';

/** Validasi inline per field saat pengguna mengetik (nama hanya divalidasi saat submit) */
const INLINE_VALIDATORS = {
  email: validateEmail,
  phone: validatePhone,
  password: validatePassword,
};

const EMPTY_FORM = { name: '', email: '', phone: '', password: '' };

export default function DaftarPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { mergeGuestCart } = useCartStore();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
    const validator = INLINE_VALIDATORS[field];
    if (validator) setErrors((prev) => ({ ...prev, [field]: validator(val) }));
    setSubmitError('');
  };

  const validate = () => {
    const e = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
    };
    setErrors(e);
    return Object.values(e).every((v) => !v);
  };

  // Tombol Daftar nonaktif sampai semua field valid & S&K dicentang (SPEC §6)
  const canSubmit =
    !validateName(form.name) &&
    !validateEmail(form.email) &&
    !validatePhone(form.phone) &&
    !validatePassword(form.password) &&
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
      <AuthHeader
        title="Buat Akun"
        subtitle="Daftar gratis, mulai pesan sekarang"
        className="mb-7"
      />

      <DaftarForm
        form={form}
        errors={errors}
        agreeTerms={agreeTerms}
        onAgreeTermsChange={setAgreeTerms}
        onFieldChange={handleChange}
        onSubmit={handleSubmit}
        submitError={submitError}
        loading={loading}
        canSubmit={canSubmit}
      />

      <p className="text-center text-sm text-cocoa/60 mt-6">
        Sudah punya akun?{' '}
        <Link to={CUSTOMER_ROUTES.MASUK} className="text-primary font-semibold hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
