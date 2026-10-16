// components/admin/BestSellersPanel.jsx
// Step 4 · FR-27 · AD-02 — produk terlaris 7 hari dengan bar jumlah (sumber sama dengan Best Sellers Beranda)

import { formatNumber } from '../../utils/format';

/** @param {Array<{product_id, name, category_name, image_url, quantity_sold}>} products */
export default function BestSellersPanel({ products }) {
  if (!products.length) return <p className="text-sm text-cocoa/70">Belum ada penjualan 7 hari terakhir.</p>;
  const max = products[0].quantity_sold;
  return (
    <ol className="space-y-3">
      {products.map((p, i) => (
        <li key={p.product_id} className="flex items-center gap-3">
          <span className="w-5 text-xs font-bold text-cocoa/60 tabular-nums">{i + 1}</span>
          {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-cocoa truncate">{p.name}</p>
              <p className="text-xs font-semibold text-cocoa tabular-nums shrink-0">{formatNumber(p.quantity_sold)} pcs</p>
            </div>
            <div className="h-1.5 rounded-full bg-beige overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(p.quantity_sold / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
