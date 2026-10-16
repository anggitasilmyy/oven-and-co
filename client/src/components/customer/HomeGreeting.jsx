// components/customer/HomeGreeting.jsx
// Step 4 · FR-05 · C-05 — sapaan (tamu/pelanggan) + kolom pencarian menuju C-08

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { getGreeting } from '../../utils/format';

/** @param {object|null} user — pengguna login dari useAuthStore */
export default function HomeGreeting({ user }) {
  const firstName = user?.name?.split(' ')[0];
  // Jam dibaca sekali saat halaman dibuka
  const [greeting] = useState(() => getGreeting(new Date().getHours()));

  return (
    <section aria-labelledby="home-greeting" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">{firstName ? `${greeting},` : greeting}</p>
        <h1 id="home-greeting" className="font-display text-3xl md:text-4xl lg:text-5xl text-cocoa leading-tight">
          {firstName ? `${firstName}!` : 'Selamat datang di Oven & Co.'}
        </h1>
        <p className="mt-2 text-sm md:text-base text-cocoa/70">Temukan freshly baked favorites dari Oven &amp; Co.</p>
      </div>

      {/* Pencarian — membuka halaman Pencarian (C-08) */}
      <Link
        to={CUSTOMER_ROUTES.CARI}
        className="flex items-center gap-3 h-12 w-full lg:max-w-sm shrink-0 px-4 rounded-btn bg-beige text-sm text-cocoa/60
                   border border-transparent transition-colors hover:border-primary/30 hover:bg-beige/70
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.99]"
      >
        <Search size={18} className="text-primary shrink-0" aria-hidden="true" />
        <span className="truncate">Cari croissant, cake, cookies...</span>
      </Link>
    </section>
  );
}
