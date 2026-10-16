// pages/customer/LupaSandiPage.jsx
// C-04 · Lupa Kata Sandi (OTP)
// Step 3 · Authentication
// FR-03 · Reset sandi via OTP email 6 digit
// Validation rules SPEC §6: OTP 6 digit, belum kedaluwarsa, kirim ulang setelah hitung mundur

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { requestOtp, verifyOtpAndReset } from '../../services/authService';
import { CUSTOMER_ROUTES } from '../../constants/routes';

/** Hitung mundur kirim ulang OTP (detik) */
const RESEND_COOLDOWN = 60;

export default function LupaSandiPage() {
  const navigate = useNavigate();

  // Step 1: input email | Step 2: input OTP + sandi baru | Step 3: sukses
  const [step, setStep] = useState(1);

  // Step 1
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Step 2
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Hitung mundur
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const startCountdown = () => {
    setCountdown(RESEND_COOLDOWN);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  // ── Step 1: Kirim OTP ─────────────────────────────────────────────────────

  const handleSendOtp = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setEmailError('Email wajib diisi'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) { setEmailError('Format email tidak valid'); return; }

    setSendLoading(true);
    setEmailError('');
    try {
      await requestOtp(trimmed);
      setStep(2);
      startCountdown();
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setSendLoading(false);
    }
  };

  // ── Step 2: Verifikasi OTP & reset sandi ─────────────────────────────────

  // Referensi ke setiap kotak OTP untuk pindah fokus otomatis
  const otpRefs = useRef([]);

  const handleOtpChange = (idx, val) => {
    // Hanya terima 1 digit
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setOtpError('');
    // Pindah fokus ke kotak berikutnya
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setSendLoading(true);
    try {
      await requestOtp(email.trim());
      setOtp(['', '', '', '', '', '']);
      setOtpError('');
      startCountdown();
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setSendLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) { setOtpError('Masukkan 6 digit kode OTP'); return; }
    if (newPassword.length < 8) { setPasswordError('Kata sandi minimal 8 karakter'); return; }

    setResetLoading(true);
    setOtpError('');
    setPasswordError('');
    try {
      await verifyOtpAndReset({ email: email.trim(), otp: otpCode, newPassword });
      setStep(3);
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 text-center">
        <div className="text-6xl mb-6" aria-hidden="true">✅</div>
        <h1 className="font-display text-2xl text-cocoa mb-2">Kata Sandi Diperbarui!</h1>
        <p className="text-sm text-cocoa/60 mb-8">
          Silakan masuk dengan kata sandi baru kamu.
        </p>
        <Button
          id="lupa-sandi-ke-masuk-btn"
          fullWidth
          onClick={() => navigate(CUSTOMER_ROUTES.MASUK, { replace: true })}
        >
          Masuk Sekarang
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-10 w-full max-w-sm mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-cocoa mb-1">
          {step === 1 ? 'Lupa Kata Sandi' : 'Masukkan Kode OTP'}
        </h1>
        <p className="text-sm text-cocoa/60">
          {step === 1
            ? 'Masukkan email akun kamu untuk menerima kode OTP.'
            : `Kode dikirim ke ${email}. Cek console browser (mode mock).`}
        </p>
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <form id="lupa-sandi-email-form" onSubmit={handleSendOtp} noValidate className="space-y-4">
          <Input
            id="lupa-sandi-email"
            label="Email"
            type="email"
            placeholder="email@contoh.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
            error={emailError}
            leftIcon={<Mail size={18} />}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
          <Button
            id="lupa-sandi-kirim-btn"
            type="submit"
            fullWidth
            loading={sendLoading}
            disabled={!email.trim()}
          >
            Kirim Kode OTP
          </Button>
        </form>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <form id="lupa-sandi-reset-form" onSubmit={handleReset} noValidate className="space-y-6">

          {/* Kotak OTP 6 digit */}
          <div>
            <label className="block text-sm font-semibold text-cocoa mb-3">Kode OTP</label>
            <div
              className="flex gap-2 justify-between"
              onPaste={handleOtpPaste}
              role="group"
              aria-label="Masukkan 6 digit kode OTP"
            >
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (otpRefs.current[idx] = el)}
                  id={`otp-digit-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  aria-label={`Digit ${idx + 1}`}
                  className={[
                    'w-12 h-14 text-center text-xl font-bold text-cocoa rounded-xl border',
                    'transition-all duration-150 focus:outline-none focus:ring-2',
                    otpError
                      ? 'border-error focus:ring-error/30'
                      : digit
                      ? 'border-primary focus:ring-primary/30'
                      : 'border-beige bg-cream focus:ring-primary/30',
                  ].join(' ')}
                />
              ))}
            </div>
            {otpError && (
              <p role="alert" className="mt-2 text-xs text-error flex items-center gap-1">
                <span aria-hidden="true">⚠</span> {otpError}
              </p>
            )}
          </div>

          {/* Kirim ulang */}
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || sendLoading}
            className={[
              'flex items-center gap-2 text-sm font-semibold transition-colors',
              countdown > 0 || sendLoading
                ? 'text-cocoa/40 cursor-not-allowed'
                : 'text-primary hover:underline',
            ].join(' ')}
            aria-label="Kirim ulang OTP"
          >
            <RefreshCw size={14} className={sendLoading ? 'animate-spin' : ''} />
            {countdown > 0 ? `Kirim ulang dalam ${countdown}s` : 'Kirim ulang kode'}
          </button>

          {/* Sandi baru */}
          <Input
            id="lupa-sandi-new-password"
            label="Kata Sandi Baru"
            type={showNewPassword ? 'text' : 'password'}
            placeholder="Minimal 8 karakter"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
            error={passwordError}
            leftIcon={<Lock size={18} />}
            rightIcon={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? 'Sembunyikan' : 'Tampilkan'}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            autoComplete="new-password"
            required
          />

          <Button
            id="lupa-sandi-reset-btn"
            type="submit"
            fullWidth
            loading={resetLoading}
            disabled={otp.join('').length < 6 || newPassword.length < 8}
          >
            Simpan Kata Sandi Baru
          </Button>
        </form>
      )}
    </div>
  );
}
