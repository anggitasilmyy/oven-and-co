// routes/OnboardingGuard.jsx
// Step 3 · Authentication
// C-01: kunjungan pertama ke "/" otomatis diarahkan ke /onboarding

import { Navigate } from 'react-router-dom';
import { CUSTOMER_ROUTES } from '../constants/routes';

/** Key localStorage penanda onboarding sudah pernah dilihat */
const ONBOARDING_KEY = 'ovenco_onboarding_done';

/**
 * Wrap komponen Beranda.
 * Jika ovenco_onboarding_done belum ada, redirect ke /onboarding.
 * Setelah onboarding selesai, kunci diset dan tidak akan redirect lagi.
 */
export default function OnboardingGuard({ children }) {
  const done = localStorage.getItem(ONBOARDING_KEY);
  if (!done) {
    return <Navigate to={CUSTOMER_ROUTES.ONBOARDING} replace />;
  }
  return children;
}
