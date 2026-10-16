// components/customer/CartItemCard.jsx
// Step 5.3 · FR-11 · C-12 — kartu item keranjang: foto, nama, varian/desain/catatan, badge, tanggal siap,
// harga, stepper jumlah (≤ stok ready), dan hapus.

import { Trash2 } from 'lucide-react';
import Badge from '../ui/Badge';
import ProductImage from '../ui/ProductImage';
import QuantityStepper from '../ui/QuantityStepper';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { AVAILABILITY_TYPE, AVAILABILITY_BADGE } from '../../constants/product';

/**
 * @param {object} line — baris getCartView
 * @param {number} maxQuantity — batas stepper (produk ready: sisa stok dikurangi item lain produk yang sama)
 */
export default function CartItemCard({ line, maxQuantity, onQuantityChange, onRemove }) {
  const badge = AVAILABILITY_BADGE[line.availability_type];
  const isReady = line.availability_type === AVAILABILITY_TYPE.READY;
  const details = [line.variant_name, line.design?.options, line.design?.writing].filter(Boolean);
  const overStock = isReady && line.available && line.quantity > maxQuantity;

  return (
    <li className="card p-3 md:p-4 flex gap-3 md:gap-4">
      <ProductImage
        src={line.image_url}
        sizes="96px"
        className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-btn object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-semibold text-cocoa leading-snug">{line.name}</h3>
          <button
            type="button"
            onClick={onRemove}
            className="w-11 h-11 -mt-2 -mr-2 shrink-0 flex items-center justify-center rounded-full text-cocoa/60 hover:text-error hover:bg-red-50
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            aria-label={`Hapus ${line.name} dari keranjang`}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
        {details.length > 0 && <p className="text-xs text-cocoa/65 break-words">{details.join(' · ')}</p>}
        {line.design?.has_reference_photo && <p className="text-xs text-cocoa/65">Dengan foto referensi</p>}
        {line.note && <p className="text-xs text-cocoa/65 break-words">Catatan: {line.note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant} className="!px-2.5 text-[11px]">{badge.label}</Badge>
          {!isReady && <span className="text-xs text-cocoa/70">Siap {formatDate(parseDateKey(line.ready_date))}</span>}
        </div>
        {!line.available && <p className="text-xs font-semibold text-error" role="status">Produk ini sudah tidak tersedia. Hapus dari keranjang.</p>}
        {overStock && <p className="text-xs font-semibold text-error" role="status">Stok hari ini tinggal {line.remaining_today}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="font-bold text-primary tabular-nums">{formatRupiah(line.line_total)}</p>
          <QuantityStepper
            value={line.quantity}
            max={line.available ? Math.max(maxQuantity, line.quantity) : 0}
            onChange={onQuantityChange}
            label={`Jumlah ${line.name}`}
          />
        </div>
      </div>
    </li>
  );
}
