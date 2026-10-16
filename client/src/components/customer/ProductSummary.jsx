// components/customer/ProductSummary.jsx
// Step 5.1 · FR-08 · C-09 — badge ketersediaan + tanggal siap tercepat, nama, rating, harga

import { Link } from 'react-router-dom';
import Badge from '../ui/Badge';
import StarRating from '../ui/StarRating';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { AVAILABILITY_TYPE, AVAILABILITY_BADGE, SOLD_OUT_BADGE } from '../../constants/product';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';

/** Teks badge: "Ready · Bisa diambil hari ini" / "Pre-order H-1 · Siap mulai Selasa, 13 Okt" */
function badgeFor(product) {
  if (product.availability_type === AVAILABILITY_TYPE.READY && product.remaining_today === 0) {
    return { ...SOLD_OUT_BADGE, text: SOLD_OUT_BADGE.label };
  }
  const badge = AVAILABILITY_BADGE[product.availability_type];
  const text =
    product.availability_type === AVAILABILITY_TYPE.READY
      ? badge.longLabel
      : `${badge.longLabel} · Siap mulai ${formatDate(parseDateKey(product.earliest_ready_date))}`;
  return { ...badge, text };
}

export default function ProductSummary({ product, unitPrice }) {
  const badge = badgeFor(product);
  const { average, count } = product.rating_summary;
  const isReady = product.availability_type === AVAILABILITY_TYPE.READY;

  return (
    <div className="space-y-3">
      <Badge variant={badge.variant}>{badge.text}</Badge>
      <h1 className="font-display text-3xl lg:text-4xl text-cocoa leading-tight">{product.name}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {count > 0 ? (
          <Link
            to={buildPath(CUSTOMER_ROUTES.PRODUK_ULASAN, { id: product.product_id })}
            className="inline-flex items-center gap-2 min-h-touch-min -my-2 rounded-btn hover:underline
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <StarRating value={average} />
            <span className="font-semibold text-cocoa">{average.toLocaleString('id-ID')}</span>
            <span className="text-cocoa/65">({count} ulasan)</span>
          </Link>
        ) : (
          <span className="text-cocoa/65">Belum ada ulasan</span>
        )}
        <span className="text-cocoa/40" aria-hidden="true">•</span>
        <span className="text-cocoa/65">{product.category_name}</span>
      </div>
      <p className="font-sans font-bold text-2xl text-primary tabular-nums">{formatRupiah(unitPrice)}</p>
      {isReady && product.remaining_today > 0 && (
        <p className="text-sm text-cocoa/70">Sisa stok hari ini: <span className="font-semibold text-cocoa tabular-nums">{product.remaining_today}</span></p>
      )}
    </div>
  );
}
