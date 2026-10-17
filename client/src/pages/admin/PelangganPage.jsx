// pages/admin/PelangganPage.jsx
// FR-35 · UC-25 · A-10 · BR-11 · AD-10 Pelanggan & Ulasan (Staf & Owner)
// Step 5.8: tab Pelanggan (tabel + pencarian) dan tab Ulasan (filter rating, balas, sembunyikan/tampilkan).
// Tab & filter rating disimpan di URL (?tab=ulasan&rating=5).

import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Tabs from '../../components/ui/Tabs';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import CustomerListPanel from '../../components/admin/CustomerListPanel';
import AdminReviewPanel from '../../components/admin/AdminReviewPanel';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getAdminCustomers, getAdminReviews } from '../../services/adminCustomerService';
import { CUSTOMER_ADMIN_TAB, CUSTOMER_ADMIN_TABS, ADMIN_REVIEW_RATING_ALL, ADMIN_REVIEW_RATING_FILTERS } from '../../constants/adminCustomer';

export default function PelangganPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === CUSTOMER_ADMIN_TAB.ULASAN ? CUSTOMER_ADMIN_TAB.ULASAN : CUSTOMER_ADMIN_TAB.PELANGGAN;
  const rating = ADMIN_REVIEW_RATING_FILTERS.some((f) => f.key === params.get('rating')) ? params.get('rating') : ADMIN_REVIEW_RATING_ALL;
  const customers = useServiceQuery(getAdminCustomers);
  const reviews = useServiceQuery(() => getAdminReviews(rating), [rating]);
  const { toast, showToast, hideToast } = useToast();

  const changeTab = (key) => setParams(key === CUSTOMER_ADMIN_TAB.PELANGGAN ? {} : { tab: key });
  const changeRating = (key) => setParams(key === ADMIN_REVIEW_RATING_ALL ? { tab: CUSTOMER_ADMIN_TAB.ULASAN } : { tab: CUSTOMER_ADMIN_TAB.ULASAN, rating: key }, { replace: true });

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-10"
        title="Pelanggan & Ulasan"
        description="Pantau pelanggan beserta riwayat belanjanya, lalu balas atau sembunyikan ulasan produk."
      />
      <Tabs tabs={CUSTOMER_ADMIN_TABS} value={tab} onChange={changeTab} label="Bagian pelanggan" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === CUSTOMER_ADMIN_TAB.PELANGGAN && (
          <>
            {customers.error && <ErrorState message={customers.error.message || 'Daftar pelanggan gagal dimuat.'} onRetry={customers.reload} />}
            {!customers.data && !customers.error && (
              <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat pelanggan">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
              </div>
            )}
            {customers.data && <CustomerListPanel rows={customers.data} />}
          </>
        )}
        {tab === CUSTOMER_ADMIN_TAB.ULASAN && (
          <AdminReviewPanel query={reviews} rating={rating} onRatingChange={changeRating} onToast={showToast} />
        )}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
