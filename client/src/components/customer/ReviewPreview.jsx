// components/customer/ReviewPreview.jsx
// Step 5.1 · FR-09 · C-09 — cuplikan "Ulasan Pelanggan" (2 ulasan terbaru) + tautan "Lihat semua ulasan"

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import ReviewCard from './ReviewCard';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';

export default function ReviewPreview({ productId, summary, reviews }) {
  return (
    <section aria-labelledby="ulasan-pelanggan" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="ulasan-pelanggan" className="font-display text-2xl text-cocoa">Ulasan Pelanggan</h2>
        {summary.count > 0 && (
          <Link
            to={buildPath(CUSTOMER_ROUTES.PRODUK_ULASAN, { id: productId })}
            className="shrink-0 inline-flex items-center gap-1 min-h-touch-min px-2 -mr-2 rounded-btn text-sm font-semibold text-primary
                       hover:text-cocoa hover:bg-beige/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Lihat semua ulasan
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {reviews.length === 0 ? (
        <p className="card p-5 text-sm text-cocoa/70">Belum ada ulasan untuk produk ini.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reviews.map((r) => <ReviewCard key={r.review_id} review={r} compact />)}
        </div>
      )}
    </section>
  );
}
