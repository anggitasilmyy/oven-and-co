// components/customer/NotificationItem.jsx
// Step 5.5 · FR-18 · C-24 — satu notifikasi: ikon per tipe, judul, isi, waktu, titik peach bila belum dibaca.

import { Package, Tag, Coins, ChevronRight } from 'lucide-react';
import { formatDateShort, formatTime } from '../../utils/format';
import { dateKeyOf } from '../../utils/date';
import { NOTIFICATION_TYPE } from '../../constants/notification';

const TYPE_ICON = {
  [NOTIFICATION_TYPE.ORDER_STATUS]: { Icon: Package, bg: 'bg-beige' },
  [NOTIFICATION_TYPE.PROMO]: { Icon: Tag, bg: 'bg-peach/60' },
  [NOTIFICATION_TYPE.POINTS]: { Icon: Coins, bg: 'bg-sage/70' },
};

/**
 * @param {object} notification — hasil notificationService.getMyNotifications()
 * @param {string} todayKey — notifikasi hari ini hanya menampilkan jam
 * @param {Function} onOpen — (notification) → tandai dibaca & buka tujuan
 */
export default function NotificationItem({ notification: n, todayKey, onOpen }) {
  const { Icon, bg } = TYPE_ICON[n.type] ?? TYPE_ICON[NOTIFICATION_TYPE.ORDER_STATUS];
  const when = dateKeyOf(n.created_at) === todayKey ? formatTime(n.created_at) : `${formatDateShort(n.created_at)} · ${formatTime(n.created_at)}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={`w-full text-left flex items-start gap-3 px-4 py-4 md:px-5 transition-colors hover:bg-beige/40 active:bg-beige/70
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50
                    ${n.is_read ? '' : 'bg-peach/10'}`}
      >
        <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-full ${bg} text-cocoa flex items-center justify-center`}>
          <Icon size={18} />
        </span>
        <span className="flex-1 min-w-0 space-y-0.5">
          <span className="flex items-center gap-2">
            <span className={`text-sm text-cocoa ${n.is_read ? 'font-semibold' : 'font-bold'}`}>{n.title}</span>
            {!n.is_read && (
              <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-[#E9A47E]">
                <span className="sr-only">Belum dibaca</span>
              </span>
            )}
          </span>
          <span className="block text-sm text-cocoa/75 leading-relaxed break-words">{n.body}</span>
          <span className="block text-xs text-cocoa/70 tabular-nums">{when}</span>
        </span>
        <ChevronRight size={18} className="mt-2.5 text-cocoa/40 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}
