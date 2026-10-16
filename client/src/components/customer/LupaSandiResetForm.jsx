// components/customer/LupaSandiResetForm.jsx
// FR-03 · UC-03 · C-04 Lupa Kata Sandi — langkah 2: verifikasi OTP & kata sandi baru
// Validation rules SPEC §6: OTP 6 digit, belum kedaluwarsa, kirim ulang setelah hitung mundur

import { useState } from 'react';
import Button from '../ui/Button';
import PasswordInput from '../ui/PasswordInput';
import OtpInput from './OtpInput';
import ResendOtpButton from './ResendOtpButton';
import { requestOtp, verifyOtpAndReset } from '../../services/authService';
import { validatePassword } from '../../utils/authValidation';
import { OTP_LENGTH, PASSWORD_MIN_LENGTH } from '../../constants/auth';

const emptyOtp = () => Array(OTP_LENGTH).fill('');

/**
 * @param {number} countdown — sisa detik sebelum boleh kirim ulang
 * @param {() => void} onResent — mulai ulang hitung mundur
 * @param {() => void} onSuccess
 */
export default function LupaSandiResetForm({ email, countdown, onResent, onSuccess }) {
  const [otp, setOtp] = useState(emptyOtp);
  const [newPassword, setNewPassword] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleOtpChange = (next) => {
    setOtp(next);
    setOtpError('');
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    try {
      await requestOtp(email.trim());
      setOtp(emptyOtp());
      setOtpError('');
      onResent();
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < OTP_LENGTH) { setOtpError(`Masukkan ${OTP_LENGTH} digit kode OTP`); return; }
    const pwError = validatePassword(newPassword);
    if (pwError) { setPasswordError(pwError); return; }

    setResetLoading(true);
    setOtpError('');
    setPasswordError('');
    try {
      await verifyOtpAndReset({ email: email.trim(), otp: otpCode, newPassword });
      onSuccess();
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <form id="lupa-sandi-reset-form" onSubmit={handleSubmit} noValidate className="space-y-6">
      <OtpInput value={otp} onChange={handleOtpChange} error={otpError} />

      <ResendOtpButton countdown={countdown} loading={resendLoading} onClick={handleResend} />

      <PasswordInput
        id="lupa-sandi-new-password"
        label="Kata Sandi Baru"
        placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
        value={newPassword}
        onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
        error={passwordError}
        showLabel="Tampilkan"
        hideLabel="Sembunyikan"
        autoComplete="new-password"
        required
      />

      <Button
        id="lupa-sandi-reset-btn"
        type="submit"
        fullWidth
        loading={resetLoading}
        disabled={otp.join('').length < OTP_LENGTH || newPassword.length < PASSWORD_MIN_LENGTH}
      >
        Simpan Kata Sandi Baru
      </Button>
    </form>
  );
}
