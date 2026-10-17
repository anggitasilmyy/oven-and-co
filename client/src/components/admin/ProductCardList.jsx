// components/admin/ProductCardList.jsx
// Step 5.7 · FR-30 · AD-06 — daftar produk versi kartu untuk layar < 768 px (isi sama dengan tabel)

import Switch from '../ui/Switch';
import ProductImage from '../ui/ProductImage';
import ProductTypeBadge from './ProductTypeBadge';
import ProductRating from './ProductRating';
import ProductEditButton from './ProductEditButton';
import { stockTodayText } from './productColumns';
import { formatRupiah } from '../../utils/format';

/** @param {{rows, onToggle, onEdit, pendingId}} props */
export default function ProductCardList({ rows, onToggle, onEdit, pendingId }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.product_id} className={`card-admin p-4 ${r.is_active ? '' : 'bg-beige/20'}`}>
          <div className="flex gap-3">
            <ProductImage src={r.image_url} alt="" sizes="80px" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className={`font-semibold text-sm leading-snug ${r.is_active ? 'text-cocoa' : 'text-cocoa/60'}`}>{r.name}</p>
              <p className="mt-0.5 text-xs text-cocoa/65">{r.category_name}{r.is_active ? '' : ' · Nonaktif'}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ProductTypeBadge row={r} />
                <span className="text-sm font-bold text-cocoa tabular-nums">{formatRupiah(r.price)}</span>
              </div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-cocoa/60">Stok hari ini</dt><dd className="font-semibold text-cocoa tabular-nums">{stockTodayText(r)}</dd></div>
            <div><dt className="text-cocoa/60">Rating</dt><dd className="font-semibold text-cocoa"><ProductRating rating={r.rating} /></dd></div>
          </dl>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-beige pt-2">
            <Switch
              checked={r.is_active}
              disabled={pendingId === r.product_id}
              onChange={(checked) => onToggle(r, checked)}
              label={`${r.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${r.name}`}
            />
            <ProductEditButton row={r} onEdit={onEdit} />
          </div>
        </li>
      ))}
    </ul>
  );
}
