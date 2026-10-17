// components/customer/AccountMenu.jsx
// Step 5.5 · C-20 — daftar menu akun (ikon + chevron) untuk HP & tablet. Di ≥ lg menu yang sama tampil
// sebagai AccountSidebar di AccountLayout, jadi daftar ini disembunyikan oleh halaman.

import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { ACCOUNT_MENU_ITEMS } from '../../constants/navigation';
import { formatNumber } from '../../utils/format';

const rowClass = `flex items-center gap-3 min-h-[52px] px-4 text-sm font-semibold transition-colors active:bg-beige/70
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50`;

/**
 * @param {Record<string, number>} [badges] — jumlah per key menu (mis. { notifikasi: 3 })
 * @param {Function} onLogout
 */
export default function AccountMenu({ badges = {}, onLogout, className = '' }) {
  return (
    <nav aria-label="Menu akun" className={`card overflow-hidden ${className}`}>
      <ul className="divide-y divide-beige">
        {ACCOUNT_MENU_ITEMS.map(({ key, label, to, Icon }) => (
          <li key={key}>
            <Link to={to} className={`${rowClass} text-cocoa hover:bg-beige/40`}>
              <Icon size={20} className="text-primary shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {badges[key] > 0 && (
                <span className="min-w-[24px] h-6 px-2 rounded-pill bg-peach text-cocoa text-xs font-bold flex items-center justify-center tabular-nums">
                  {formatNumber(badges[key])}
                  <span className="sr-only"> belum dibaca</span>
                </span>
              )}
              <ChevronRight size={18} className="text-cocoa/40 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={onLogout} className={`${rowClass} w-full text-error hover:bg-red-50`}>
            <LogOut size={20} className="shrink-0" aria-hidden="true" />
            Keluar
          </button>
        </li>
      </ul>
    </nav>
  );
}
