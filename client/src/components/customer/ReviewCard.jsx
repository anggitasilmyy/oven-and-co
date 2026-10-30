// components/customer/ReviewCard.jsx
// Step 5.1 · FR-09 · C-09/C-10 — kartu ulasan: avatar, nama, tanggal, bintang, varian, teks, foto, balasan toko
// Step 6.3: foto unggahan server (/uploads/reviews/…) dimuat lewat toUploadUrl (data URL mode mock tidak berubah)

import StarRating from '../ui/StarRating';
import { formatDate } from '../../utils/format';
import { toUploadUrl } from '../../services/apiClient';

const initials = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function ReviewCard({ review, compact = false }) {
  return (
    <article className="card p-4 md:p-5 space-y-3">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-peach text-cocoa text-sm font-bold flex items-center justify-center">
          {initials(review.reviewer_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-cocoa truncate">{review.reviewer_name}</p>
          <p className="text-xs text-cocoa/60">{formatDate(review.created_at)}</p>
        </div>
        <StarRating value={review.rating} />
      </header>

      {(review.variant_name || review.tags.length > 0) && (
        <p className="flex flex-wrap gap-2 text-xs">
          {review.variant_name && <span className="text-cocoa/65">Varian: {review.variant_name}</span>}
          {review.tags.map((t) => (
            <span key={t} className="badge bg-beige text-cocoa !py-0.5">{t}</span>
          ))}
        </p>
      )}

      {review.comment && (
        <p className={`text-sm text-cocoa/85 leading-relaxed ${compact ? 'line-clamp-3' : ''}`}>{review.comment}</p>
      )}

      {review.photos.length > 0 && (
        <ul className="flex gap-2" aria-label="Foto ulasan">
          {review.photos.map((src, i) => (
            <li key={`${src}-${i}`}>
              <img src={toUploadUrl(src)} alt={`Foto ulasan ${i + 1} dari ${review.reviewer_name}`} loading="lazy"
                   className="w-16 h-16 md:w-20 md:h-20 rounded-btn object-cover bg-beige" />
            </li>
          ))}
        </ul>
      )}

      {!compact && review.admin_reply && (
        <div className="rounded-btn bg-cream border border-beige px-4 py-3 text-sm">
          <p className="font-semibold text-cocoa mb-1">Balasan Oven &amp; Co.</p>
          <p className="text-cocoa/80">{review.admin_reply}</p>
        </div>
      )}
    </article>
  );
}
