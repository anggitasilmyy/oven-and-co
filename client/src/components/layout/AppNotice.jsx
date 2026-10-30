// components/layout/AppNotice.jsx
// Step 6.3 (temuan L1) · FR-26 — notifikasi global dari useNoticeStore (mis. hasil simpan desain saat identitas
// berganti). Dipasang sekali di App.jsx, di luar pohon halaman yang dipasang ulang per identitas.

import Toast from '../ui/Toast';
import useNoticeStore from '../../stores/useNoticeStore';
import { APP_NOTICE_DURATION } from '../../constants/apiErrors';

export default function AppNotice() {
  const notice = useNoticeStore((s) => s.notice);
  const dismiss = useNoticeStore((s) => s.dismissNotice);
  if (!notice) return null;

  return (
    <Toast
      key={notice.id}
      type={notice.type}
      message={notice.message}
      show
      onClose={dismiss}
      duration={APP_NOTICE_DURATION}
    />
  );
}
