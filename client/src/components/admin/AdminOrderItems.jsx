// components/admin/AdminOrderItems.jsx
// Step 5.6 · FR-28 · AD-04 — daftar item (harga salinan saat pesanan dibuat) + spesifikasi custom cake
// (ukuran, bentuk, rasa, krim & topping, tulisan, thumbnail foto referensi — PRD Batch 6)

import ProductImage from '../ui/ProductImage';
import { formatRupiah } from '../../utils/format';

function CustomCakeSpec({ spec }) {
  return (
    <div className="mt-3 rounded-xl bg-pink/40 p-3 text-xs text-cocoa space-y-2">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
        {spec.options.map((o) => (
          <div key={o.label} className="contents">
            <dt className="text-cocoa/70">{o.label}</dt>
            <dd className="font-medium break-words">{o.value}</dd>
          </div>
        ))}
        <dt className="text-cocoa/70">Tulisan</dt>
        <dd className="font-medium break-words">{spec.writing_text ? `"${spec.writing_text}" · ${spec.writing_color}` : '-'}</dd>
      </dl>
      {spec.reference_photo_url && (
        // Foto referensi disimpan sebagai data URL di mode mock, jadi hanya ditampilkan sebagai thumbnail
        <figure className="flex items-center gap-2">
          <img src={spec.reference_photo_url} alt="Foto referensi custom cake" className="w-16 h-16 rounded-lg object-cover" />
          <figcaption className="font-medium">Foto referensi</figcaption>
        </figure>
      )}
    </div>
  );
}

/** @param {Array} items — item getAdminOrderDetail */
export default function AdminOrderItems({ items }) {
  return (
    <section aria-labelledby="admin-items-title" className="card-admin p-5 md:p-6">
      <h2 id="admin-items-title" className="font-display text-lg text-cocoa mb-3">Item Pesanan</h2>
      <ul className="divide-y divide-beige">
        {items.map((item) => (
          <li key={item.order_item_id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex gap-3">
              <ProductImage src={item.image_url} sizes="56px" className="w-14 h-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-cocoa leading-snug">{item.name}</p>
                {item.variant_name && <p className="text-xs text-cocoa/65">Varian: {item.variant_name}</p>}
                {item.note && <p className="text-xs text-cocoa/65 break-words">Catatan: {item.note}</p>}
                <p className="text-xs text-cocoa/70 tabular-nums">{item.quantity} × {formatRupiah(item.unit_price)}</p>
              </div>
              <p className="font-semibold text-cocoa tabular-nums shrink-0">{formatRupiah(item.line_total)}</p>
            </div>
            {/* Spesifikasi di bawah baris item (lebar penuh) agar tidak terjepit kolom harga di layar sempit */}
            {item.design_spec && <CustomCakeSpec spec={item.design_spec} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
