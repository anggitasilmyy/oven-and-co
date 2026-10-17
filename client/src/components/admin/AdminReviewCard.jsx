// components/admin/AdminReviewCard.jsx
// Step 5.8 · FR-35 · BR-11 · AD-10 — satu ulasan untuk moderasi: produk, pengulas, bintang, tag, teks, foto,
// balasan toko, aksi "Balas" dan "Sembunyikan"/"Tampilkan" (UI/UX Spec Batch 7).

import { Eye, EyeOff, MessageSquareReply } from 'lucide-react';
import Badge from '../ui/Badge';
import StarRating from '../ui/StarRating';
import { formatDateShort } from '../../utils/format';

const actionClass =
  'inline-flex h-11 min-w-touch-min items-center justify-center gap-1.5 rounded-lg border border-beige px-3 text-xs font-semibold ' +
  'text-primary hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50';

/**
 * @param {object} review — baris getAdminReviews
 * @param {Function} onReply — (review) → void
 * @param {Function} onToggleHidden — (review) → void
 * @param {boolean} [busy]
 */
export default function AdminReviewCard({ review, onReply, onToggleHidden, busy = false }) {
  return (
    <li className={`card-admin space-y-3 p-4 md:p-5 ${review.is_hidden ? 'opacity-75' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-cocoa">{review.product_name}{review.variant_name ? ` · ${review.variant_name}` : ''}</p>
          <p className="text-xs text-cocoa/70">
            {review.reviewer_name} · {formatDateShort(review.created_at)}{review.order_number ? ` · ${review.order_number}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review.is_hidden && <Badge variant="error">Disembunyikan</Badge>}
          <StarRating value={review.rating} />
        </div>
      </div>
      {review.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tag ulasan">
          {review.tags.map((t) => <li key={t}><Badge variant="neutral">{t}</Badge></li>)}
        </ul>
      )}
      {review.comment ? <p className="text-sm text-cocoa/85">{review.comment}</p> : <p className="text-sm italic text-cocoa/60">Tanpa komentar</p>}
      {review.photos.length > 0 && (
        <ul className="flex gap-2" aria-label="Foto ulasan">
          {review.photos.map((src, i) => <li key={src}><img src={src} alt={`Foto ulasan ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" loading="lazy" /></li>)}
        </ul>
      )}
      {review.admin_reply && (
        <div className="rounded-btn border-l-4 border-primary bg-cream px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-primary">Balasan toko</p>
          <p className="text-cocoa/80">{review.admin_reply}</p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-beige pt-3">
        <button type="button" className={actionClass} disabled={busy} onClick={() => onReply(review)} aria-label={`${review.admin_reply ? 'Ubah balasan' : 'Balas'} ulasan ${review.reviewer_name} untuk ${review.product_name}`}>
          <MessageSquareReply size={14} aria-hidden="true" /> {review.admin_reply ? 'Ubah balasan' : 'Balas'}
        </button>
        <button type="button" className={actionClass} disabled={busy} onClick={() => onToggleHidden(review)} aria-label={`${review.is_hidden ? 'Tampilkan' : 'Sembunyikan'} ulasan ${review.reviewer_name} untuk ${review.product_name}`}>
          {review.is_hidden ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
          {review.is_hidden ? 'Tampilkan' : 'Sembunyikan'}
        </button>
      </div>
    </li>
  );
}
