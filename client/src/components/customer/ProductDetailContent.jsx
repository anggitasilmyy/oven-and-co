// components/customer/ProductDetailContent.jsx
// Step 5.1 · FR-08 · C-09 — isi Detail Produk (kolom kiri) + ActionBar (bar bawah / panel kanan)

import Button from '../ui/Button';
import QuantityStepper from '../ui/QuantityStepper';
import FocusPageGrid from '../layout/FocusPageGrid';
import ActionBar from '../layout/ActionBar';
import ProductGallery from './ProductGallery';
import ProductSummary from './ProductSummary';
import VariantChips from './VariantChips';
import PreorderDatePicker from './PreorderDatePicker';
import ProductInfoSections from './ProductInfoSections';
import ReviewPreview from './ReviewPreview';
import WishlistButton from './WishlistButton';
import useProductPurchase from '../../hooks/useProductPurchase';
import { formatRupiah } from '../../utils/format';
import { ITEM_NOTE_MAX_LENGTH } from '../../constants/productDetail';

export default function ProductDetailContent({ product, wishlist, notify }) {
  const p = useProductPurchase(product, notify);

  const aside = (
    <ActionBar
      label="Ringkasan & aksi"
      summary={
        <div>
          <p className="text-xs text-cocoa/65">Total{p.quantity > 1 ? ` · ${p.quantity} item` : ''}</p>
          <p className="font-bold text-lg lg:text-2xl text-cocoa tabular-nums" aria-live="polite">{formatRupiah(p.total)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <Button fullWidth onClick={p.addToCart} disabled={Boolean(p.blockedReason)}>
          {p.isReady && product.remaining_today === 0 ? 'Stok habis' : 'Tambah ke Keranjang'}
        </Button>
        {p.blockedReason && <p className="text-xs text-error text-center lg:text-left" role="status">{p.blockedReason}</p>}
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-6 lg:space-y-8">
        <ProductGallery
          images={product.images}
          name={product.name}
          overlay={
            <WishlistButton
              active={wishlist.isWishlisted(product.product_id)}
              disabled={wishlist.pendingId === product.product_id}
              productName={product.name}
              onClick={() => wishlist.toggleWishlist(product)}
            />
          }
        />

        <ProductSummary product={product} unitPrice={p.unitPrice} />

        <div className="space-y-6">
          <VariantChips variants={product.variants} value={p.variantId} onChange={p.setVariantId} />

          <div>
            <p id="jumlah-label" className="text-sm font-bold text-cocoa mb-3">Jumlah</p>
            <div className="flex flex-wrap items-center gap-3">
              <QuantityStepper value={p.quantity} max={p.maxQuantity} onChange={p.setQuantity} label="Jumlah" />
              {p.isReady && p.inCart > 0 && (
                <span className="text-xs text-cocoa/65">{p.inCart} sudah di keranjang · maks. {p.maxQuantity} lagi</span>
              )}
            </div>
          </div>

          {p.isPreorder && (
            <PreorderDatePicker
              todayKey={product.today_key}
              earliestKey={product.earliest_ready_date}
              cutoffTime={product.preorder_cutoff_time}
              value={p.preferredDate}
              onChange={p.setPreferredDate}
            />
          )}

          <div>
            <label htmlFor="catatan-toko" className="block text-sm font-bold text-cocoa mb-1.5">
              Catatan untuk toko <span className="font-normal text-cocoa/60">(opsional)</span>
            </label>
            <textarea
              id="catatan-toko"
              rows={2}
              maxLength={ITEM_NOTE_MAX_LENGTH}
              value={p.note}
              onChange={(e) => p.setNote(e.target.value)}
              placeholder="Mis. tolong dipisah per kotak"
              className="input h-auto py-3 resize-none"
            />
          </div>
        </div>

        <ProductInfoSections product={product} />
        <ReviewPreview productId={product.product_id} summary={product.rating_summary} reviews={product.review_preview} />
      </div>
    </FocusPageGrid>
  );
}
