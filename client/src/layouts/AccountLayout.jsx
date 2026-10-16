// layouts/AccountLayout.jsx
// Step 2.5 (PR A) · C-20 – C-23 · FR-22 – FR-25 · NFR-06 (CR-01)
// ≥ lg : menu Akun (isi sama dengan C-20) menjadi sidebar kiri, sub-halaman di kanan
// < lg : perilaku lama dipertahankan — hanya konten halaman (menu ada di C-20 /akun)
//
// Catatan PR A: komponen disiapkan saja; pemasangan ke rute /akun/* dilakukan di PR B.

import { Outlet } from 'react-router-dom';
import AccountSidebar from '../components/layout/AccountSidebar';

export default function AccountLayout({ children }) {
  const content = children ?? <Outlet />;

  return (
    <div className="page-container py-6 lg:py-10 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 xl:gap-10 lg:items-start">
      <div className="hidden lg:block lg:sticky lg:top-24">
        <AccountSidebar />
      </div>
      <div className="min-w-0">{content}</div>
    </div>
  );
}
