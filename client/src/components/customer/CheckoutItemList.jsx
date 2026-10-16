// components/customer/CheckoutItemList.jsx
// Step 5.3 · FR-12 · C-13 — daftar item yang bisa dibuka/tutup ("3 item · Lihat detail")

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ProductImage from '../ui/ProductImage';
import { formatRupiah } from '../../utils/format';

/** @param {object[]} lines — baris getCartView yang tersedia */
export default function CheckoutItemList({ lines }) {
  const [open, setOpen] = useState(false);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <section className="card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="checkout-items"
        className="w-full min-h-touch-min flex items-center justify-between gap-3 text-sm rounded-btn
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <span className="font-bold text-cocoa">{count} item</span>
        <span className="inline-flex items-center gap-1 font-semibold text-primary">
          {open ? 'Sembunyikan' : 'Lihat detail'}
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ul id="checkout-items" className="mt-2 divide-y divide-beige">
          {lines.map((l) => (
            <li key={l.cart_item_id} className="flex items-center gap-3 py-2.5">
              <ProductImage src={l.image_url} sizes="48px" className="w-12 h-12 shrink-0 rounded-btn object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-cocoa truncate">{l.name}</p>
                <p className="text-xs text-cocoa/65 truncate">
                  {[l.variant_name, l.design?.options].filter(Boolean).join(' · ') || ' '}
                </p>
              </div>
              <p className="text-sm text-cocoa tabular-nums text-right shrink-0">
                ×{l.quantity}<span className="block font-semibold">{formatRupiah(l.line_total)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
