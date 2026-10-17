// pages/customer/AkunPage.jsx
// FR-22 · FR-24 · UC-16 · C-20 Akun
// Step 5.5: header profil, kartu member (poin, level, progres), menu Pesanan Saya, Voucher & Poin, Alamat Tersimpan,
// Wishlist, Notifikasi (jumlah belum dibaca), Ubah Profil, Keluar.
// ≥ lg: menu tampil sebagai sidebar AccountLayout, jadi daftar menu di konten disembunyikan.

import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import ProfileHeader from '../../components/customer/ProfileHeader';
import MemberCard from '../../components/customer/MemberCard';
import AccountMenu from '../../components/customer/AccountMenu';
import useAuthStore from '../../stores/useAuthStore';
import useServiceQuery from '../../hooks/useServiceQuery';
import useLogout from '../../hooks/useLogout';
import { getMyLoyaltySummary } from '../../services/loyaltyService';
import { getMyUnreadNotificationCount } from '../../services/notificationService';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function AkunPage() {
  const user = useAuthStore((s) => s.user);
  const loyalty = useServiceQuery(() => getMyLoyaltySummary(), [user?.user_id]);
  const unread = useServiceQuery(() => getMyUnreadNotificationCount(), [user?.user_id]);
  const logoutAndLeave = useLogout();

  return (
    <AccountLayout>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Akun" />
        <div className="grid gap-5 lg:gap-6 md:grid-cols-2 md:items-stretch">
          <ProfileHeader user={user} />
          <MemberCard summary={loyalty.data} loading={loyalty.loading} error={loyalty.error} onRetry={loyalty.reload} />
        </div>
        <AccountMenu
          className="lg:hidden"
          badges={{ notifikasi: unread.data ?? 0 }}
          onLogout={() => logoutAndLeave(CUSTOMER_ROUTES.BERANDA)}
        />
      </div>
    </AccountLayout>
  );
}
