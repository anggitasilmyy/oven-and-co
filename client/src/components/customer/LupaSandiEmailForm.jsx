// components/customer/LupaSandiEmailForm.jsx
// FR-03 · UC-03 · C-04 Lupa Kata Sandi — langkah 1: input email & kirim OTP

import { useState } from 'react';
import { Mail } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { requestOtp } from '../../services/authService';
import { validateEmail } from '../../utils/authValidation';

export default function LupaSandiEmailForm({ email, onEmailChange, onSent }) {
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validateEmail(email);
    if (error) { setEmailError(error); return; }

    setLoading(true);
    setEmailError('');
    try {
      await requestOtp(email.trim());
      onSent();
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="lupa-sandi-email-form" onSubmit={handleSubmit} noValidate className="space-y-4">
      <Input
        id="lupa-sandi-email"
        label="Email"
        type="email"
        placeholder="email@contoh.com"
        value={email}
        onChange={(e) => { onEmailChange(e.target.value); setEmailError(''); }}
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
        loading={loading}
        disabled={!email.trim()}
      >
        Kirim Kode OTP
      </Button>
    </form>
  );
}
