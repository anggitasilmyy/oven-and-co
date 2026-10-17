// components/admin/AdminTopbar.jsx
// FR-26 · Topbar admin: tombol buka drawer (< lg) + info pengguna
// Dipisah dari layouts/AdminLayout.jsx di Step 2.5 (PR B) tanpa mengubah perilaku.

import { Menu } from 'lucide-react';
import { ROLE_LABEL } from '../../constants/roles';
import AdminAvatar from './AdminAvatar';

/**
 * @param {object|null} user
 * @param {boolean} isSidebarOpen — untuk aria-expanded tombol menu
 * @param {Function} onOpenSidebar
 */
export default function AdminTopbar({ user, isSidebarOpen, onOpenSidebar }) {
  return (
    <header className="print:hidden sticky top-0 z-30 bg-surface border-b border-beige h-14 lg:h-16 flex items-center px-4 md:px-6 lg:px-8 gap-4">
      {/* Hamburger mobile */}
      <button
        onClick={onOpenSidebar}
        className="lg:hidden w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-beige active:bg-beige/70
                   transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-expanded={isSidebarOpen}
        aria-label="Buka menu"
      >
        <Menu size={20} className="text-cocoa" />
      </button>

      <div className="flex-1" />

      {/* Info user di topbar */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-cocoa leading-tight">{user.name}</p>
            <p className="text-xs text-cocoa/50 capitalize">{ROLE_LABEL[user.role]}</p>
          </div>
          <AdminAvatar name={user.name} variant="light" />
        </div>
      )}
    </header>
  );
}
