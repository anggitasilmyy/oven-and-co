// pages/customer/PembayaranPage.jsx
// FR-14 · FR-15 · BR-05 · BR-06 · UC-09 · C-14 Metode Pembayaran
// Step 5.3: QRIS, e-wallet, virtual account, Bayar di Toko (hanya pickup + semua item ready).
// "Bayar Sekarang" membuat pesanan: online → Halaman Bayar (C-15) · Bayar di Toko → Pesanan Berhasil (C-16).
// ?pesanan=OVC-… : mode "Ganti Metode" untuk pesanan yang masih Menunggu Pembayaran.
// Review c53a11c (M1): pesanan yang sudah dibuat server tidak dianggap gagal hanya karena sesi berganti; hanya item yang
// dipesan yang dihapus dari keranjang pemiliknya. POST pesanan tidak pernah dikirim ulang otomatis.
// Review 776c824 (M-2): yang dikurangi adalah JUMLAH yang dipesan (snapshot request), bukan seluruh baris.

import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import PaymentMethodScreen from '../../components/customer/PaymentMethodScreen';
import useCartStore from '../../stores/useCartStore';
import useCheckoutStore from '../../stores/useCheckoutStore';
import useCartView from '../../hooks/useCartView';
import useCheckoutForm from '../../hooks/useCheckoutForm';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getCheckoutContext } from '../../services/checkoutService';
import { createOrder, getOrderPayment, changePaymentMethod } from '../../services/orderService';
import { createSessionBoundNotifier } from '../../services/sessionScope';
import { isCommittedForOtherSessionError } from '../../utils/apiErrors';
import { orderPlacedNotice } from '../../constants/checkout';
import { toOrderedLines } from '../../utils/rules/cart';
import { CUSTOMER_ROUTES, buildPath } from '../../constants/routes';
import { PAYMENT_OPTION } from '../../constants/orderStatus';

const nextRoute = ({ order_number, payment_option }) =>
  buildPath(payment_option === PAYMENT_OPTION.PAY_AT_STORE ? CUSTOMER_ROUTES.PESANAN_BERHASIL : CUSTOMER_ROUTES.BAYAR, { orderNumber: order_number });

/** Pesanan baru dari keranjang + pilihan checkout */
function NewOrderPayment({ ctx, cart, notify, onPlaced }) {
  const f = useCheckoutForm(ctx, cart);
  const removeOrderedItems = useCartStore((s) => s.removeOrderedItems);
  const resetCheckout = useCheckoutStore((s) => s.resetCheckout);
  if (f.blockedReason) return <Navigate to={CUSTOMER_ROUTES.CHECKOUT} replace />;

  const submit = async (methodCode) => {
    // Halaman bisa dipasang ulang saat identitas berganti → pesan hasil lewat notifikasi global
    const report = createSessionBoundNotifier(notify);
    // Snapshot yang dikirim ke server: hanya jumlah ini yang dikurangi dari keranjang setelah pesanan berhasil
    const orderedItems = cart.items;
    const orderedLines = toOrderedLines(orderedItems);
    try {
      const result = await createOrder({
        items: orderedItems,
        fulfillment: f.draft.fulfillment,
        address_id: f.isDelivery ? f.address.address_id : null,
        ready_date: f.readyDate,
        time_slot: f.timeSlot,
        voucher_code: f.draft.voucherCode,
        use_points: f.draft.usePoints,
        method_code: methodCode,
      });
      // Tujuan dicatat bersamaan dengan pengosongan keranjang agar halaman ini tidak mengalihkan ke Keranjang.
      // Halaman sudah dipasang ulang (pemilik yang sama masuk lagi) → arahan tidak berlaku, beri tahu nomor pesanan.
      if (report.isPageReplaced()) report('success', orderPlacedNotice(result.order_number));
      else onPlaced(nextRoute(result));
      // Hanya jumlah yang dipesan: tambahan jumlah & item lain dari tab lain selama checkout tetap di keranjang
      removeOrderedItems(orderedLines);
      resetCheckout();
    } catch (e) {
      // M1: akun aktif sudah berbeda — pesanan milik akun sebelumnya, keranjang akun aktif tidak disentuh
      report(isCommittedForOtherSessionError(e) ? 'info' : 'error', e.message);
    }
  };
  return <PaymentMethodScreen methods={ctx.payment_methods} total={f.quote.total} payAtStoreAllowed={f.quote.payAtStoreAllowed} onSubmit={submit} />;
}

/** Ganti metode untuk pesanan yang sudah dibuat */
function ChangeMethod({ orderNumber, ctx, notify }) {
  const navigate = useNavigate();
  const order = useServiceQuery(() => getOrderPayment(orderNumber), [orderNumber]);
  if (order.error) return <div className="page-container py-6"><ErrorState message={order.error.message} onRetry={order.reload} /></div>;
  if (!order.data) return <div className="page-container py-6"><Skeleton count={4} /></div>;
  const submit = async (methodCode) => {
    try {
      navigate(nextRoute(await changePaymentMethod(orderNumber, methodCode)), { replace: true });
    } catch (e) {
      notify('error', e.message);
    }
  };
  return (
    <PaymentMethodScreen
      methods={ctx.payment_methods}
      total={order.data.order.total}
      payAtStoreAllowed={order.data.pay_at_store_allowed}
      initialMethod={order.data.payment?.method_code}
      description={`Pesanan ${orderNumber}`}
      onSubmit={submit}
    />
  );
}

export default function PembayaranPage() {
  const [params] = useSearchParams();
  const orderNumber = params.get('pesanan');
  const cart = useCartView();
  const ctx = useServiceQuery(() => getCheckoutContext(), []);
  const { toast, showToast, hideToast } = useToast();
  const [placedRoute, setPlacedRoute] = useState(null);

  let body;
  if (placedRoute) body = <Navigate to={placedRoute} replace />;
  else if (!orderNumber && cart.items.length === 0) body = <Navigate to={CUSTOMER_ROUTES.KERANJANG} replace />;
  else if (ctx.error) body = <div className="page-container py-6"><ErrorState message={ctx.error.message} onRetry={ctx.reload} /></div>;
  else if (!ctx.data || (!orderNumber && cart.loading)) body = <div className="page-container py-6" aria-busy="true"><Skeleton count={5} /></div>;
  else if (orderNumber) body = <ChangeMethod orderNumber={orderNumber} ctx={ctx.data} notify={showToast} />;
  else body = <NewOrderPayment ctx={ctx.data} cart={cart} notify={showToast} onPlaced={setPlacedRoute} />;

  return (
    <>
      {body}
      <Toast {...toast} onClose={hideToast} />
    </>
  );
}
