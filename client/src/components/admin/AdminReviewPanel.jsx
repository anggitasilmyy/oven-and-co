// components/admin/AdminReviewPanel.jsx
// Step 5.8 · FR-35 · AD-10 — tab Ulasan: filter rating, ringkasan, daftar ulasan, balas & sembunyikan (dengan konfirmasi)
// Ulasan disembunyikan tidak tampil di C-09/C-10 dan tidak dihitung di rating (rules/rating.js); bisa ditampilkan lagi.

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import Chip from '../ui/Chip';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import Pagination from './Pagination';
import AdminReviewCard from './AdminReviewCard';
import ReviewReplyModal from './ReviewReplyModal';
import ConfirmActionModal from './ConfirmActionModal';
import { setReviewHidden } from '../../services/adminCustomerService';
import { ADMIN_REVIEW_RATING_FILTERS, ADMIN_REVIEWS_PAGE_SIZE } from '../../constants/adminCustomer';

/**
 * @param {{data, error, loading, reload}} query — useServiceQuery(getAdminReviews(rating))
 * @param {string} rating — filter aktif
 * @param {Function} onRatingChange — (key) → void
 * @param {Function} onToast — (type, message) → void
 */
export default function AdminReviewPanel({ query, rating, onRatingChange, onToast }) {
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState(null);
  const [hiding, setHiding] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const show = async (review) => {
    setPendingId(review.review_id);
    try {
      await setReviewHidden(review.review_id, false);
      onToast('success', 'Ulasan ditampilkan kembali di halaman produk');
      query.reload();
    } catch (err) {
      onToast('error', err.message);
    } finally {
      setPendingId(null);
    }
  };
  const hide = async () => {
    await setReviewHidden(hiding.review_id, true);
    setHiding(null);
    onToast('success', 'Ulasan disembunyikan dari pelanggan');
    query.reload();
  };

  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / ADMIN_REVIEWS_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * ADMIN_REVIEWS_PAGE_SIZE, current * ADMIN_REVIEWS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter rating" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ADMIN_REVIEW_RATING_FILTERS.map((f) => (
          <Chip key={f.key} size="compact" selected={f.key === rating} onClick={() => { onRatingChange(f.key); setPage(1); }}>{f.label}</Chip>
        ))}
      </div>
      {query.error && <ErrorState message={query.error.message || 'Ulasan gagal dimuat.'} onRetry={query.reload} />}
      {!query.data && !query.error && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat ulasan">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="block" className="h-36 w-full" />)}
        </div>
      )}
      {query.data && (
        <div className={`space-y-4 transition-opacity ${query.loading ? 'opacity-60' : ''}`}>
          <p className="text-sm text-cocoa/70">
            {rows.length} ulasan ditampilkan · total {query.data.summary.total} · {query.data.summary.hidden} disembunyikan · {query.data.summary.unreplied} belum dibalas
          </p>
          {visible.length === 0 ? (
            <div className="card-admin"><EmptyState icon={<MessageSquare size={32} aria-hidden="true" />} title="Belum ada ulasan" description="Ulasan dengan rating ini belum ada." /></div>
          ) : (
            <ul className="grid gap-4 xl:grid-cols-2" aria-label="Daftar ulasan">
              {visible.map((r) => (
                <AdminReviewCard key={r.review_id} review={r} busy={pendingId === r.review_id} onReply={setReplying} onToggleHidden={(x) => (x.is_hidden ? show(x) : setHiding(x))} />
              ))}
            </ul>
          )}
          <Pagination page={current} totalPages={totalPages} onChange={setPage} label="Halaman daftar ulasan" />
        </div>
      )}

      {replying && (
        <ReviewReplyModal review={replying} onClose={() => setReplying(null)} onSaved={(m) => { setReplying(null); onToast('success', m); query.reload(); }} />
      )}
      {hiding && (
        <ConfirmActionModal title="Sembunyikan ulasan?" confirmLabel="Sembunyikan" onConfirm={hide} onClose={() => setHiding(null)}>
          <p>Ulasan <strong>{hiding.reviewer_name}</strong> untuk <strong>{hiding.product_name}</strong> tidak akan tampil di halaman produk dan tidak dihitung dalam rating.</p>
          <p>Ulasan tetap tersimpan dan bisa ditampilkan kembali kapan saja.</p>
        </ConfirmActionModal>
      )}
    </div>
  );
}
