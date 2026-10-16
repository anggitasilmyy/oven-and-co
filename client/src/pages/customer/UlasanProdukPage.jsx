// pages/customer/UlasanProdukPage.jsx
// FR-09 · UC-05 · C-10 Ulasan Produk
// Step 5.1: ringkasan rating & distribusi bintang, filter (Semua, Dengan Foto, rating), daftar ulasan.
// Ulasan is_hidden tidak pernah ditampilkan (disaring di service & utils/rules/rating.js).
// ≥ lg: ringkasan menjadi kolom kiri yang menempel; daftar ulasan di kanan.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MessageSquareText, PackageX, Star } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import PageHeader from '../../components/layout/PageHeader';
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import RatingSummary from '../../components/customer/RatingSummary';
import ReviewCard from '../../components/customer/ReviewCard';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getProductReviews } from '../../services/reviewService';
import { filterReviews } from '../../utils/businessRules';
import { REVIEW_FILTER, REVIEW_FILTER_OPTIONS } from '../../constants/productDetail';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';

export default function UlasanProdukPage() {
  const { id } = useParams();
  const [filter, setFilter] = useState(REVIEW_FILTER.ALL);
  const query = useServiceQuery(() => getProductReviews(id), [id]);
  const data = query.data;
  const shown = useMemo(() => (data ? filterReviews(data.reviews, filter) : []), [data, filter]);

  if (query.error) {
    return <PageContainer className="py-6"><ErrorState message="Ulasan gagal dimuat." onRetry={query.reload} /></PageContainer>;
  }
  if (query.loading && !data) {
    return (
      <PageContainer className="py-6 lg:py-10 space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton variant="block" className="h-40 w-full rounded-card" />
        <Skeleton count={4} />
      </PageContainer>
    );
  }
  if (!data) {
    return (
      <PageContainer className="py-10">
        <div className="card">
          <EmptyState icon={<PackageX size={36} aria-hidden="true" />} title="Produk tidak ditemukan" description="Produk ini tidak tersedia." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="py-6 lg:py-10 space-y-6">
      <PageHeader
        title="Ulasan"
        description={
          <Link to={buildPath(CUSTOMER_ROUTES.PRODUK_DETAIL, { id })} className="font-semibold text-primary hover:underline">
            {data.product.name}
          </Link>
        }
      />
      <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <div className="lg:sticky lg:top-24">
          <RatingSummary summary={data.summary} />
        </div>

        <section aria-label="Daftar ulasan" className="space-y-4 min-w-0">
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter ulasan">
            {REVIEW_FILTER_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                size="compact"
                selected={filter === o.value}
                onClick={() => setFilter(o.value)}
                aria-label={o.stars ? `Bintang ${o.label}` : undefined}
                leftIcon={o.stars && <Star size={14} aria-hidden="true" className={filter === o.value ? 'fill-white' : 'fill-[#D9A441] text-[#D9A441]'} />}
              >
                {o.label}
                {o.value === REVIEW_FILTER.WITH_PHOTO && ` (${data.summary.withPhotoCount})`}
              </Chip>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<MessageSquareText size={36} aria-hidden="true" />}
                title={data.summary.count === 0 ? 'Belum ada ulasan' : 'Tidak ada ulasan untuk filter ini'}
                description={data.summary.count === 0
                  ? 'Ulasan muncul setelah pelanggan menyelesaikan pesanan produk ini.'
                  : 'Coba pilih filter lain.'}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((r) => <ReviewCard key={r.review_id} review={r} />)}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
