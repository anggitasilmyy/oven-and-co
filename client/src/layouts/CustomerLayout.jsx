// layouts/CustomerLayout.jsx
// Step 2 · Layout & Komponen Dasar — Step 2.5 (PR A): responsive (CR-01)
// FR-05, FR-06, FR-17, FR-19, FR-22, FR-24 — layout utama pelanggan
// < md : SiteHeader (logo + keranjang) + BottomNav 4 tab
// ≥ md : SiteHeader dengan top navigation; tanpa BottomNav

import { Outlet } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import BottomNav from '../components/layout/BottomNav';

export default function CustomerLayout() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <SiteHeader />

      {/* Ruang bawah hanya < md agar konten tidak tertutup BottomNav (72 px + safe area).
          Lebar & padding diatur halaman lewat PageContainer. */}
      <main className="flex-1 w-full pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
