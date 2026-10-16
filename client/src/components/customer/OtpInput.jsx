// components/customer/OtpInput.jsx
// FR-03 · C-04 Lupa Kata Sandi — kotak OTP 6 digit dengan pindah fokus otomatis

import { useRef } from 'react';
import { OTP_LENGTH } from '../../constants/auth';

/**
 * @param {string[]} value — array digit sepanjang OTP_LENGTH
 * @param {(next:string[]) => void} onChange
 * @param {string} error
 */
export default function OtpInput({ value, onChange, error }) {
  // Referensi ke setiap kotak OTP untuk pindah fokus otomatis
  const otpRefs = useRef([]);

  const handleChange = (idx, val) => {
    // Hanya terima 1 digit
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[idx] = digit;
    onChange(next);
    if (digit && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length === OTP_LENGTH) {
      onChange(pasted.split(''));
      otpRefs.current[OTP_LENGTH - 1]?.focus();
    }
    e.preventDefault();
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-cocoa mb-3">Kode OTP</label>
      <div
        className="flex gap-2 justify-between"
        onPaste={handlePaste}
        role="group"
        aria-label={`Masukkan ${OTP_LENGTH} digit kode OTP`}
      >
        {value.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (otpRefs.current[idx] = el)}
            id={`otp-digit-${idx}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            aria-label={`Digit ${idx + 1}`}
            className={[
              'w-12 h-14 text-center text-xl font-bold text-cocoa rounded-xl border',
              'transition-all duration-150 focus:outline-none focus:ring-2',
              error
                ? 'border-error focus:ring-error/30'
                : digit
                ? 'border-primary focus:ring-primary/30'
                : 'border-beige bg-cream focus:ring-primary/30',
            ].join(' ')}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-error flex items-center gap-1">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </div>
  );
}
