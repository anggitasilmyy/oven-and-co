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
import { CART_UNAVAILABLE_MESSAGE, CART_UNAVAILABLE_DEFAULT_MESSAGE } from '../../constants/cart';
import { getCartLineQuantityControl } from '../../utils/rules/cart';

/**
 * @param {object} line — baris getCartView
 * @param {number} maxQuantity — batas stepper (produk ready: sisa stok dikurangi item lain produk yang sama)
 */
export default function CartItemCard({ line, maxQuantity, onQuantityChange, onRemove }) {
  const badge = AVAILABILITY_BADGE[line.availability_type];
  const isReady = line.availability_type === AVAILABILITY_TYPE.READY;
  const details = [line.variant_name, line.design?.options, line.design?.writing].filter(Boolean);
  const overStock = isReady && line.available && line.quantity > maxQuantity;
  // Step 6.3: jumlah di atas batas tetap bisa dikurangi pelanggan; bila stok habis, baris hanya bisa dihapus
  const { stepperMax, adjustTo, soldOut } = getCartLineQuantityControl(line, maxQuantity);
  const unavailableMessage = soldOut
    ? `Stok hari ini habis. Hapus item ini dari keranjang (jumlah ${line.quantity}).`
    : CART_UNAVAILABLE_MESSAGE[line.unavailable_reason] ?? CART_UNAVAILABLE_DEFAULT_MESSAGE;

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
        {!line.available && <p className="text-xs font-semibold text-error" role="status">{unavailableMessage}</p>}
        {adjustTo != null && (
          <button
            type="button"
            onClick={() => onQuantityChange(adjustTo)}
            className="min-h-11 text-xs font-semibold text-primary underline underline-offset-2 hover:text-cocoa
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
          >
            Ubah jumlah menjadi {adjustTo}
          </button>
        )}
        {overStock && <p className="text-xs font-semibold text-error" role="status">Stok hari ini tinggal {line.remaining_today}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="font-bold text-primary tabular-nums">{formatRupiah(line.line_total)}</p>
          <QuantityStepper
            value={line.quantity}
            max={stepperMax}
            // Jumlah asli tetap terlihat walau stepper nonaktif (bukan "0")
            showValueWhenDisabled
            onChange={onQuantityChange}
            label={`Jumlah ${line.name}`}
          />
        </div>
      </div>
    </li>
  );
}
