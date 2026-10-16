// pages/customer/CheckoutPage.jsx
// FR-12 · FR-13 · BR-01 – BR-04 · BR-09 · BR-10 · BR-12 · UC-08 · C-13 Checkout
// Step 5.3: Pickup/Delivery, alamat tersimpan + ongkir otomatis, tanggal & slot, voucher, tukar poin,
// ringkasan biaya berjalan, lanjut ke Metode Pembayaran (C-14). Wajib masuk (ProtectedRoute, BR-04).

import { useNavigate } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import CheckoutContent from '../../components/customer/CheckoutContent';
import useCartView from '../../hooks/useCartView';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getCheckoutContext } from '../../services/checkoutService';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useCartView();
  const ctx = useServiceQuery(() => getCheckoutContext(), []);

  if (cart.items.length === 0) {
    return (
      <div className="page-container py-10">
        <div className="card">
          <EmptyState
            icon={<ShoppingBasket size={36} aria-hidden="true" />}
            title="Keranjangmu masih kosong"
            description="Tambahkan produk dulu sebelum checkout."
            actionLabel="Mulai Belanja"
            onAction={() => navigate(CUSTOMER_ROUTES.KATALOG)}
          />
        </div>
      </div>
    );
  }
  if (ctx.error || cart.error) {
    return (
      <div className="page-container py-6">
        <ErrorState message={ctx.error?.message ?? 'Checkout gagal dimuat.'} onRetry={() => { ctx.reload(); cart.reload(); }} />
      </div>
    );
  }
  if (!ctx.data || cart.loading) {
    return (
      <FocusPageGrid aside={<div className="hidden lg:block card p-6"><Skeleton count={3} /></div>}>
        <div className="space-y-4" aria-busy="true" aria-label="Memuat checkout">
          <Skeleton count={1} />
          <Skeleton variant="block" className="h-14 w-full rounded-btn" />
          <Skeleton variant="block" className="h-24 w-full rounded-card" />
          <Skeleton variant="block" className="h-40 w-full rounded-card" />
        </div>
      </FocusPageGrid>
    );
  }
  return <CheckoutContent ctx={ctx.data} cart={cart} />;
}
