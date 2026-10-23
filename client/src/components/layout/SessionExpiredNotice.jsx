// components/layout/SessionExpiredNotice.jsx
// Step 6.3 · FR-26 · BR-04 — notifikasi global saat sesi dihapus otomatis karena token ditolak server
// (401 SESSION_INVALID, lihat services/apiClient.js). Dipasang sekali di App.jsx agar muncul di semua layout.

import Toast from '../ui/Toast';
import useAuthStore from '../../stores/useAuthStore';
import { SESSION_EXPIRED_NOTICE, SESSION_EXPIRED_NOTICE_DURATION } from '../../constants/apiErrors';

export default function SessionExpiredNotice() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const dismiss = useAuthStore((s) => s.dismissSessionNotice);

  return (
    <Toast
      type="info"
      message={SESSION_EXPIRED_NOTICE}
      show={sessionExpired}
      onClose={dismiss}
      duration={SESSION_EXPIRED_NOTICE_DURATION}
    />
  );
}
