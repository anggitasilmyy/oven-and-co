// components/admin/OrderReceipt.jsx
// Step 5.6 · FR-28 "struk dapat dicetak" · AD-04 — struk pesanan untuk window.print()
// Hanya tampil saat mencetak (print:block); navigasi, tombol, dan kartu layar disembunyikan (print:hidden).
// Isi diambil dari data detail yang sama dengan layar sehingga mencetak tidak mengubah data apa pun.

import { orderCostRows } from './orderCostRows';
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL, PAYMENT_OPTION, PAYMENT_STATUS, PAYMENT_STATUS_LABEL } from '../../constants/orderStatus';
import { PAY_AT_STORE_LABEL } from '../../constants/checkout';
import { formatRupiah, formatDate, formatDateShort, formatTime } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

const Row = ({ label, children, strong = false }) => (
  <div className={`flex justify-between gap-4 ${strong ? 'font-bold text-base' : ''}`}>
    <dt>{label}</dt>
    <dd className="text-right tabular-nums">{children}</dd>
  </div>
);

/** @param {object} detail — hasil getAdminOrderDetail */
export default function OrderReceipt({ detail }) {
  const { order, customer, items, payment, store } = detail;
  const unpaidAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE && order.payment_status === PAYMENT_STATUS.UNPAID;
  return (
    <article data-print="receipt" aria-label={`Struk ${order.order_number}`} className="hidden print:block mx-auto max-w-[80mm] text-[12px] leading-snug text-black">
      <header className="text-center border-b border-dashed border-black pb-2 mb-2">
        <p className="font-display text-lg font-bold">{store.name}</p>
        {store.address && <p>{store.address}</p>}
        {store.whatsapp && <p>WhatsApp {store.whatsapp}</p>}
      </header>
      <dl className="space-y-0.5 border-b border-dashed border-black pb-2 mb-2">
        <Row label="No. Pesanan"><span className="font-mono font-bold">{order.order_number}</span></Row>
        <Row label="Tanggal">{formatDateShort(order.created_at)}, {formatTime(order.created_at)}</Row>
        <Row label="Pelanggan">{customer.name}</Row>
        <Row label={FULFILLMENT_LABEL[order.fulfillment_type]}>{formatDate(parseDateKey(order.ready_date))} · {order.time_slot}</Row>
        <Row label="Status">{ORDER_STATUS_LABEL[order.order_status]}</Row>
      </dl>
      <ul className="space-y-1.5 border-b border-dashed border-black pb-2 mb-2">
        {items.map((item) => (
          <li key={item.order_item_id}>
            <p className="font-semibold">{item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</p>
            <div className="flex justify-between gap-4 tabular-nums">
              <span>{item.quantity} × {formatRupiah(item.unit_price)}</span>
              <span>{formatRupiah(item.line_total)}</span>
            </div>
          </li>
        ))}
      </ul>
      <dl className="space-y-0.5 border-b border-dashed border-black pb-2 mb-2">
        {orderCostRows(order).map((r) => (
          <Row key={r.label} label={r.label}>{r.discount ? '-' : ''}{formatRupiah(r.amount)}</Row>
        ))}
        <Row label="Total" strong>{formatRupiah(order.total)}</Row>
      </dl>
      <dl className="space-y-0.5">
        <Row label="Metode bayar">{payment.method_name}</Row>
        <Row label="Pembayaran">{unpaidAtStore ? PAY_AT_STORE_LABEL : PAYMENT_STATUS_LABEL[order.payment_status]}</Row>
      </dl>
      <p className="text-center mt-3">Terima kasih — Freshly Baked, Made With Care</p>
    </article>
  );
}
