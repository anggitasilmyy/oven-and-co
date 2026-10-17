// components/customer/OrderItemList.jsx
// Step 5.4 · FR-17 · C-18 — daftar item pesanan (harga salinan saat pesanan dibuat) + penanda "Sudah diulas"

import Badge from '../ui/Badge';
import ProductImage from '../ui/ProductImage';
import { formatRupiah } from '../../utils/format';

/**
 * @param {Array} items — item getMyOrderDetail
 * @param {boolean} showReviewed — tampilkan penanda ulasan (pesanan Selesai)
 */
export default function OrderItemList({ items, showReviewed = false }) {
  return (
    <section aria-label="Item pesanan" className="card p-5 md:p-6">
      <h2 className="font-display text-xl text-cocoa mb-3">Item Pesanan</h2>
      <ul className="divide-y divide-beige">
        {items.map((item) => {
          const details = [item.variant_name, item.design?.options, item.design?.writing].filter(Boolean);
          return (
            <li key={item.order_item_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <ProductImage src={item.image_url} sizes="64px" className="w-16 h-16 shrink-0 rounded-btn object-cover" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-semibold text-cocoa leading-snug">{item.name}</p>
                {details.length > 0 && <p className="text-xs text-cocoa/65 break-words">{details.join(' · ')}</p>}
                {item.note && <p className="text-xs text-cocoa/65 break-words">Catatan: {item.note}</p>}
                <p className="text-xs text-cocoa/70 tabular-nums">{item.quantity} × {formatRupiah(item.unit_price)}</p>
                {showReviewed && item.reviewed && <Badge variant="ready" className="!px-2.5 text-[11px]">Sudah diulas</Badge>}
              </div>
              <p className="font-semibold text-cocoa tabular-nums shrink-0">{formatRupiah(item.line_total)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
