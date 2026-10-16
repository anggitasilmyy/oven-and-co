// components/customer/PasswordStrengthMeter.jsx
// FR-01 · C-03 Daftar — indikator kekuatan kata sandi (UI/UX Spec C-03)

import { getPasswordStrength } from '../../utils/authValidation';
import { PASSWORD_STRENGTH } from '../../constants/auth';

/** Warna batang per tingkat kekuatan */
const BAR_COLOR = {
  [PASSWORD_STRENGTH.WEAK.level]: 'bg-error',
  [PASSWORD_STRENGTH.MEDIUM.level]: 'bg-peach',
  [PASSWORD_STRENGTH.STRONG.level]: 'bg-sage',
};

const SEGMENTS = Object.values(PASSWORD_STRENGTH).map((s) => s.level);

export default function PasswordStrengthMeter({ password, id }) {
  const strength = getPasswordStrength(password);
  if (!strength) return null;

  return (
    <div id={id} className="mt-2 flex items-center gap-3">
      <div className="flex-1 flex gap-1.5" aria-hidden="true">
        {SEGMENTS.map((level) => (
          <span
            key={level}
            className={`h-1.5 flex-1 rounded-full ${
              level <= strength.level ? BAR_COLOR[strength.level] : 'bg-beige'
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-semibold text-cocoa min-w-[48px] text-right" aria-live="polite">
        <span className="sr-only">Kekuatan kata sandi: </span>
        {strength.label}
      </p>
    </div>
  );
}
