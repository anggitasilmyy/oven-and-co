// pages/customer/NotifikasiPage.jsx
// FR-18 · BR-007 · UC-18 · C-24 Notifikasi
// Step 5.5: daftar notifikasi in-app (perubahan status pesanan, promo, poin) dikelompokkan "Hari ini" / "Sebelumnya";
// belum dibaca ditandai titik peach. Membuka notifikasi menandainya dibaca lalu menuju pesanan / riwayat poin / katalog.

import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import NotificationItem from '../../components/customer/NotificationItem';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getMyNotifications, markNotificationRead } from '../../services/notificationService';
import { groupNotificationsByDay } from '../../utils/businessRules';
import { formatNumber } from '../../utils/format';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { NOTIFICATION_TYPE } from '../../constants/notification';
import { VOUCHER_POINT_TAB } from '../../constants/account';

/** Tujuan saat notifikasi dibuka */
function targetOf(n) {
  if (n.type === NOTIFICATION_TYPE.ORDER_STATUS && n.order_number) {
    return buildPath(CUSTOMER_ROUTES.DETAIL_PESANAN, { orderNumber: n.order_number });
  }
  if (n.type === NOTIFICATION_TYPE.POINTS) return `${CUSTOMER_ROUTES.VOUCHER_POIN}?tab=${VOUCHER_POINT_TAB.POIN}`;
  if (n.type === NOTIFICATION_TYPE.PROMO) return CUSTOMER_ROUTES.VOUCHER_POIN;
  return null;
}

export default function NotifikasiPage() {
  const navigate = useNavigate();
  const query = useServiceQuery(() => getMyNotifications(), []);
  const { toast, showToast, hideToast } = useToast();

  const open = async (n) => {
    try {
      if (!n.is_read) await markNotificationRead(n.notification_id);
    } catch (err) {
      showToast('error', err.message);
      return;
    }
    const to = targetOf(n);
    if (to) navigate(to);
    else query.reload();
  };

  let body;
  if (query.error) {
    body = <ErrorState message={query.error.message} onRetry={query.reload} />;
  } else if (!query.data) {
    body = (
      <div className="card divide-y divide-beige" aria-busy="true" aria-label="Memuat notifikasi">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton variant="circle" />
            <div className="flex-1"><Skeleton count={2} /></div>
          </div>
        ))}
      </div>
    );
  } else if (query.data.items.length === 0) {
    body = (
      <div className="card">
        <EmptyState icon={<Bell size={36} aria-hidden="true" />} title="Belum ada notifikasi" description="Kabar status pesanan, promo, dan poin akan muncul di sini." />
      </div>
    );
  } else {
    body = groupNotificationsByDay(query.data.items, query.data.today_key).map((group) => (
      <section key={group.key} aria-labelledby={`notif-${group.key}`} className="space-y-2">
        <h2 id={`notif-${group.key}`} className="text-xs font-bold uppercase tracking-widest text-cocoa/70">{group.label}</h2>
        <ul className="card overflow-hidden divide-y divide-beige">
          {group.items.map((n) => <NotificationItem key={n.notification_id} notification={n} todayKey={query.data.today_key} onOpen={open} />)}
        </ul>
      </section>
    ));
  }

  const unread = query.data?.unread ?? 0;
  return (
    <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-6">
      <PageHeader title="Notifikasi" description={unread ? `${formatNumber(unread)} belum dibaca` : undefined} />
      {body}
      <Toast {...toast} onClose={hideToast} />
    </PageContainer>
  );
}
