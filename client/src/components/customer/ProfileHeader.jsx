// components/customer/ProfileHeader.jsx
// Step 5.5 · FR-24 · C-20 — header profil: avatar inisial, nama, email, nomor HP.
// Tabel users tidak punya kolom foto (SPEC §8), jadi avatar memakai inisial nama.

import { Mail, Phone } from 'lucide-react';

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** @param {{name, email, phone}} user */
export default function ProfileHeader({ user }) {
  return (
    <section aria-label="Profil" className="card p-5 lg:p-6 flex items-center gap-4">
      <div
        aria-hidden="true"
        className="w-16 h-16 lg:w-20 lg:h-20 shrink-0 rounded-full bg-primary text-cream flex items-center justify-center
                   font-display text-2xl lg:text-3xl"
      >
        {initialsOf(user?.name)}
      </div>
      <div className="min-w-0 space-y-1">
        <h2 className="font-display text-xl lg:text-2xl text-cocoa leading-tight break-words">{user?.name}</h2>
        <p className="flex items-center gap-1.5 text-sm text-cocoa/75 min-w-0">
          <Mail size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{user?.email}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-cocoa/75">
          <Phone size={14} className="shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{user?.phone}</span>
        </p>
      </div>
    </section>
  );
}
