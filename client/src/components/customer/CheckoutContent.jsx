// components/customer/CheckoutContent.jsx
// Step 5.3 · FR-12 · FR-13 · C-13 — satu halaman: Pickup/Delivery, toko/alamat, tanggal & slot, item,
// voucher, poin, ringkasan biaya, lalu "Pilih Pembayaran". Ringkasan berubah seketika saat pilihan berubah.

import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import FocusPageGrid from '../layout/FocusPageGrid';
import ActionBar from '../layout/ActionBar';
import PageHeader from '../layout/PageHeader';
import FulfillmentToggle from './FulfillmentToggle';
import FulfillmentDetails from './FulfillmentDetails';
import PreorderDatePicker from './PreorderDatePicker';
import TimeSlotChips from './TimeSlotChips';
import CheckoutItemList from './CheckoutItemList';
import VoucherField from './VoucherField';
import PointsToggle from './PointsToggle';
import CostSummary from './CostSummary';
import ReadyDateBanner from './ReadyDateBanner';
import useCheckoutForm from '../../hooks/useCheckoutForm';
import { formatRupiah, formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import { CUSTOMER_ROUTES } from '../../constants/routes';
import { CHECKOUT_DATE_WINDOW_DAYS } from '../../constants/checkout';

export default function CheckoutContent({ ctx, cart }) {
  const navigate = useNavigate();
  const f = useCheckoutForm(ctx, cart);
  const { quote } = f;

  const rows = [{ label: 'Subtotal', amount: quote.subtotal }];
  if (f.isDelivery) rows.push({ label: quote.delivery ? `Ongkir (${quote.delivery.distance.toLocaleString('id-ID')} km)` : 'Ongkir', amount: quote.shippingFee });
  if (quote.voucherDiscount) rows.push({ label: 'Diskon voucher', amount: quote.voucherDiscount, discount: true });
  if (quote.pointsDiscount) rows.push({ label: 'Poin', amount: quote.pointsDiscount, discount: true });

  const goToPayment = () => {
    f.commit();
    navigate(CUSTOMER_ROUTES.PEMBAYARAN);
  };

  const aside = (
    <ActionBar
      label="Total & aksi"
      summary={
        <div>
          <p className="text-xs text-cocoa/65">Total</p>
          <p className="font-bold text-lg lg:text-2xl text-cocoa tabular-nums" aria-live="polite">{formatRupiah(quote.total)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <Button fullWidth onClick={goToPayment} disabled={Boolean(f.blockedReason)}>Pilih Pembayaran</Button>
        {f.blockedReason && <p className="text-xs text-error text-center lg:text-left" role="status">{f.blockedReason}</p>}
      </div>
    </ActionBar>
  );

  return (
    <FocusPageGrid aside={aside}>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Checkout" />
        <FulfillmentToggle value={f.draft.fulfillment} onChange={f.setFulfillment} />
        <FulfillmentDetails
          isDelivery={f.isDelivery}
          store={ctx.store}
          addresses={ctx.addresses}
          address={f.address}
          radius={ctx.settings.delivery_radius_km}
          onSelectAddress={f.setAddress}
        />

        <section className="card p-4 space-y-5" aria-label="Jadwal">
          {f.allReady ? (
            <p className="text-sm text-cocoa">
              <span className="block font-bold">Tanggal {f.isDelivery ? 'antar' : 'ambil'}</span>
              Hari ini, {formatDate(parseDateKey(f.readyDate))}
            </p>
          ) : (
            <>
              <ReadyDateBanner readyDate={f.earliest} />
              <PreorderDatePicker
                todayKey={ctx.today_key}
                earliestKey={f.earliest}
                value={f.readyDate}
                onChange={f.setReadyDate}
                days={CHECKOUT_DATE_WINDOW_DAYS}
              />
            </>
          )}
          <TimeSlotChips slots={f.slots} value={f.timeSlot} onChange={f.setTimeSlot} />
        </section>

        <CheckoutItemList lines={f.lines} />
        <VoucherField
          applied={f.voucherEntry ? { code: f.voucherEntry.voucher.code, ...quote.voucher } : null}
          vouchers={ctx.vouchers}
          onApply={f.applyVoucher}
          onRemove={f.removeVoucher}
        />
        <PointsToggle balance={ctx.point_balance} redeemable={quote.redeemable} checked={f.draft.usePoints} onChange={f.setUsePoints} minPoints={ctx.settings.redeem_points_unit} />
        <CostSummary rows={rows} total={quote.total} />
      </div>
    </FocusPageGrid>
  );
}
