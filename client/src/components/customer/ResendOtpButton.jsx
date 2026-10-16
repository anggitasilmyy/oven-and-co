// components/customer/ResendOtpButton.jsx
// FR-03 · C-04 — kirim ulang OTP setelah hitung mundur (SPEC §6)

import { RefreshCw } from 'lucide-react';

export default function ResendOtpButton({ countdown, loading, onClick }) {
  const disabled = countdown > 0 || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center gap-2 text-sm font-semibold transition-colors',
        disabled ? 'text-cocoa/40 cursor-not-allowed' : 'text-primary hover:underline',
      ].join(' ')}
      aria-label="Kirim ulang OTP"
    >
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      {countdown > 0 ? `Kirim ulang dalam ${countdown}s` : 'Kirim ulang kode'}
    </button>
  );
}
