// components/customer/ReviewItemPicker.jsx
// Step 5.4 · FR-21 · BR-11 · C-19 — pilih produk yang diulas (satu ulasan per item); item yang sudah diulas ditandai

import { CheckCircle2 } from 'lucide-react';
import ProductImage from '../ui/ProductImage';

/**
 * @param {Array} items — item getOrderReviewForm
 * @param {number|null} value — order_item_id terpilih
 * @param {Function} onChange — (orderItemId) → void
 */
export default function ReviewItemPicker({ items, value, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-cocoa mb-2">Pilih produk yang ingin diulas</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const active = item.order_item_id === value;
          return (
            <li key={item.order_item_id}>
              <button
                type="button"
                disabled={item.reviewed}
                aria-pressed={active}
                onClick={() => onChange(item.order_item_id)}
                className={`w-full min-h-[64px] flex items-center gap-3 rounded-btn border p-2 pr-3 text-left transition
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed
                            ${active ? 'border-primary bg-primary/5' : 'border-beige bg-surface hover:border-primary/40'}
                            ${item.reviewed ? 'opacity-70' : ''}`}
              >
                <ProductImage src={item.image_url} sizes="48px" className="w-12 h-12 shrink-0 rounded-btn object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-cocoa truncate">{item.name}</span>
                  {item.reviewed && (
                    <span className="flex items-center gap-1 text-xs text-[#3F6B3A]"><CheckCircle2 size={12} aria-hidden="true" /> Sudah diulas</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
