// components/customer/GuestJoinCard.jsx
// Step 4 · C-05 — ajakan masuk/daftar untuk tamu (bukan kartu poin; tanpa data poin)

import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { CUSTOMER_ROUTES } from '../../constants/routes';

const linkBase =
  'inline-flex flex-1 items-center justify-center h-11 px-4 rounded-btn text-sm font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98]';

export default function GuestJoinCard() {
  return (
    <section aria-label="Masuk atau daftar" className="card p-5 lg:p-6 h-full flex flex-col gap-3 lg:gap-4 bg-gradient-to-br from-surface to-peach/40">
      <div className="hidden lg:flex w-11 h-11 rounded-full bg-peach items-center justify-center">
        <Gift size={20} className="text-cocoa" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display text-lg lg:text-xl text-cocoa">Kumpulkan poin di setiap pembelian.</h2>
        <p className="mt-1 text-sm text-cocoa/70">Masuk untuk melihat poin, voucher, dan riwayat pesananmu.</p>
      </div>
      <div className="mt-auto flex gap-3">
        <Link to={CUSTOMER_ROUTES.MASUK} className={`${linkBase} bg-primary text-white hover:bg-cocoa`}>
          Masuk
        </Link>
        <Link to={CUSTOMER_ROUTES.DAFTAR} className={`${linkBase} bg-beige text-cocoa border border-primary/20 hover:bg-primary/10`}>
          Daftar
        </Link>
      </div>
    </section>
  );
}
