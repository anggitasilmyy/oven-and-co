// pages/customer/LupaSandiPage.jsx
// C-04 · Lupa Kata Sandi (OTP)
// Step 3 · Authentication
// FR-03 · UC-03 · Reset sandi via OTP email 6 digit
// Validation rules SPEC §6: OTP 6 digit, belum kedaluwarsa, kirim ulang setelah hitung mundur

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthHeader from '../../components/customer/AuthHeader';
import LupaSandiEmailForm from '../../components/customer/LupaSandiEmailForm';
import LupaSandiResetForm from '../../components/customer/LupaSandiResetForm';
import LupaSandiSuccess from '../../components/customer/LupaSandiSuccess';
import useCountdown from '../../hooks/useCountdown';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { OTP_RESEND_COOLDOWN } from '../../constants/auth';

/** Langkah alur reset sandi */
const STEP = { EMAIL: 1, RESET: 2, DONE: 3 };

export default function LupaSandiPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEP.EMAIL);
  const [email, setEmail] = useState('');
  const [countdown, startCountdown] = useCountdown();

  const restartCountdown = () => startCountdown(OTP_RESEND_COOLDOWN);

  if (step === STEP.DONE) {
    return (
      <LupaSandiSuccess onLogin={() => navigate(CUSTOMER_ROUTES.MASUK, { replace: true })} />
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center px-5 py-10 w-full max-w-sm mx-auto">
      <AuthHeader
        title={step === STEP.EMAIL ? 'Lupa Kata Sandi' : 'Masukkan Kode OTP'}
        subtitle={
          step === STEP.EMAIL
            ? 'Masukkan email akun kamu untuk menerima kode OTP.'
            : `Kode dikirim ke ${email}. Cek console browser (mode mock).`
        }
      />

      {step === STEP.EMAIL && (
        <LupaSandiEmailForm
          email={email}
          onEmailChange={setEmail}
          onSent={() => { setStep(STEP.RESET); restartCountdown(); }}
        />
      )}

      {step === STEP.RESET && (
        <LupaSandiResetForm
          email={email}
          countdown={countdown}
          onResent={restartCountdown}
          onSuccess={() => setStep(STEP.DONE)}
        />
      )}
    </div>
  );
}
