// pages/customer/KeranjangPage.jsx
// FR-11 · FR-04 · BR-03 · BR-04 · UC-07 · C-12 Keranjang
// Step 5.3: item (foto, varian/desain, catatan, badge, tanggal siap), ubah jumlah ≤ stok ready, hapus item,
// banner tanggal siap pre-order (BR-03), subtotal, empty state. Checkout tamu → Masuk lalu kembali (BR-04).
// FocusPageGrid + ActionBar: < lg bar bawah · ≥ lg panel aksi sticky di kanan.
// Step 5.4: pesan hasil "Pesan Lagi" (FR-19) dari riwayat/detail pesanan, termasuk item yang tidak disalin.

import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import ActionBar from '../../components/layout/ActionBar';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import CartItemCard from '../../components/customer/CartItemCard';
import CostSummary from '../../components/customer/CostSummary';
import ReadyDateBanner from '../../components/customer/ReadyDateBanner';
import useCartView from '../../hooks/useCartView';
import { formatRupiah } from '../../utils/format';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { CART_MAX_LINES } from '../../constants/cart';

export default function KeranjangPage() {
  const navigate = useNavigate();
  const reorderNotice = useLocation().state?.reorderNotice;
  const cart = useCartView();
  const subtotal = cart.lines.filter((l) => l.available).reduce((s, l) => s + l.line_total, 0);
  const hasPreorder = cart.lines.some((l) => l.availability_type !== AVAILABILITY_TYPE.READY);

  if (cart.items.length === 0) {
    return (
      <div className="page-container py-6 lg:py-10 space-y-6">
        <PageHeader title="Keranjang" />
        <div className="card">
          <EmptyState
            icon={<ShoppingBasket size={36} aria-hidden="true" />}
            title="Keranjangmu masih kosong"
            description="Yuk, temukan freshly baked favorites."
            actionLabel="Mulai Belanja"
            onAction={() => navigate(CUSTOMER_ROUTES.KATALOG)}
          />
        </div>
      </div>
    );
  }
  if (cart.error) {
    return <div className="page-container py-6"><ErrorState message="Keranjang gagal dimuat." onRetry={cart.reload} /></div>;
  }

  const aside = (
    <ActionBar
      label="Total & aksi"
      summary={
        <div>
          <p className="text-xs text-cocoa/65">Total · {cart.itemCount} item</p>
          <p className="font-bold text-lg lg:text-2xl text-cocoa tabular-nums" aria-live="polite">{formatRupiah(subtotal)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <Button fullWidth onClick={() => navigate(CUSTOMER_ROUTES.CHECKOUT)} disabled={cart.loading || cart.blocked}>
          Checkout
        </Button>
        {cart.blocked && <p className="text-xs text-error text-center lg:text-left" role="status">Periksa item yang ditandai</p>}
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title={`Keranjang (${cart.itemCount})`} />
        {reorderNotice && (
          <p role="status" className="rounded-btn bg-peach/50 border border-peach px-4 py-3 text-sm font-medium text-cocoa">{reorderNotice}</p>
        )}
        {/* Step 6.3: keranjang hasil gabung bisa melebihi batas baris; tidak dipotong otomatis */}
        {cart.overLineLimit && (
          <p role="alert" className="rounded-btn bg-red-50 border border-error/30 px-4 py-3 text-sm font-medium text-error">
            Keranjang berisi {cart.items.length} item berbeda, maksimal {CART_MAX_LINES}. Hapus beberapa item sebelum checkout.
          </p>
        )}
        {cart.loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat keranjang">
            {cart.items.map((i) => <Skeleton key={i.cart_item_id} variant="block" className="h-28 w-full rounded-card" />)}
          </div>
        ) : (
          <>
            {hasPreorder && cart.view?.ready_date && <ReadyDateBanner readyDate={cart.view.ready_date} />}
            <ul className="space-y-3" aria-label="Item keranjang">
              {cart.lines.map((line) => (
                <CartItemCard
                  key={line.cart_item_id}
                  line={line}
                  maxQuantity={cart.maxQuantityOf(line)}
                  onQuantityChange={(q) => cart.updateQuantity(line.cart_item_id, q)}
                  onRemove={() => cart.removeItem(line.cart_item_id)}
                />
              ))}
            </ul>
            <CostSummary rows={[{ label: 'Subtotal', amount: subtotal }]} note="Ongkir dan diskon dihitung saat checkout" />
          </>
        )}
      </div>
    </FocusPageGrid>
  );
}
