// pages/customer/FormUlasanPage.jsx
// FR-21 · BR-11 · UC-14 · C-19 Form Ulasan Produk
// Step 5.4: hanya pesanan Selesai; satu ulasan per item (pilih produk bila lebih dari satu); rating 1–5, tag,
// komentar, maks. 3 foto; toast "Terima kasih atas ulasanmu! +20 poin". Alur fokus: tombol Kirim Ulasan di ActionBar.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquareHeart, PackageSearch } from 'lucide-react';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import ReviewForm from '../../components/customer/ReviewForm';
import ReviewItemPicker from '../../components/customer/ReviewItemPicker';
import useServiceQuery from '../../hooks/useServiceQuery';
import useReviewForm from '../../hooks/useReviewForm';
import { getOrderReviewForm } from '../../services/reviewService';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { REVIEW_SUCCESS_TEXT } from '../../constants/orderHistory';

export default function FormUlasanPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const query = useServiceQuery(() => getOrderReviewForm(orderNumber), [orderNumber]);
  const { toast, showToast, hideToast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const review = useReviewForm(orderNumber, (result) => {
    showToast('success', REVIEW_SUCCESS_TEXT(result.points));
    setSelectedId(null);
    query.reload();
  });

  const data = query.data?.order_number === orderNumber ? query.data : null;
  const pending = data?.items.filter((i) => !i.reviewed) ?? [];
  const selected = pending.find((i) => i.order_item_id === selectedId) ?? pending[0] ?? null;
  const detailPath = buildPath(CUSTOMER_ROUTES.DETAIL_PESANAN, { orderNumber });
  const toastEl = <Toast {...toast} onClose={hideToast} />;

  const message = (icon, title, description, actionLabel, onAction) => (
    <PageContainer variant="narrow" className="py-10">
      <div className="card"><EmptyState icon={icon} title={title} description={description} actionLabel={actionLabel} onAction={onAction} /></div>
      {toastEl}
    </PageContainer>
  );

  if (query.error && !data) {
    return <PageContainer className="py-6"><ErrorState message={query.error.message} onRetry={query.reload} /></PageContainer>;
  }
  if (!data) {
    return (
      <PageContainer variant="narrow" className="py-6 lg:py-10 space-y-4" aria-busy="true" aria-label="Memuat form ulasan">
        <Skeleton count={2} />
        <Skeleton variant="block" className="h-96 w-full rounded-card" />
      </PageContainer>
    );
  }
  if (!data.can_review) {
    return message(<PackageSearch size={36} aria-hidden="true" />, 'Ulasan belum bisa diberikan',
      'Ulasan hanya untuk pesanan yang sudah Selesai.', 'Lihat Pesanan', () => navigate(detailPath));
  }
  if (!selected) {
    return message(<MessageSquareHeart size={36} aria-hidden="true" />, 'Semua produk sudah diulas',
      'Terima kasih sudah berbagi pengalamanmu!', 'Kembali ke Pesanan', () => navigate(detailPath));
  }

  const aside = (
    <ActionBar
      label="Kirim ulasan"
      summary={<p className="text-sm font-semibold text-cocoa">+{data.bonus_points} poin</p>}
    >
      <Button fullWidth onClick={() => review.submit(selected.order_item_id)} disabled={!review.canSubmit} loading={review.submitting}>
        Kirim Ulasan
      </Button>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Beri Ulasan" description={<>Pesanan <span className="font-mono font-semibold text-cocoa">{orderNumber}</span></>} />
        {data.items.length > 1 && (
          <ReviewItemPicker
            items={data.items}
            value={selected.order_item_id}
            onChange={(id) => { setSelectedId(id); review.reset(); }}
          />
        )}
        <ReviewForm key={selected.order_item_id} item={selected} review={review} />
      </div>
      {toastEl}
    </FocusPageGrid>
  );
}
