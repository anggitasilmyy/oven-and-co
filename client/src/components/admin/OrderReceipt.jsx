// components/admin/OrderReceipt.jsx
// Step 5.6 · FR-28 "struk dapat dicetak" · AD-04 — struk pesanan untuk window.print()
// Hanya tampil saat mencetak (print:block); navigasi, tombol, dan kartu layar disembunyikan (print:hidden).
// Isi diambil dari data detail yang sama dengan layar sehingga mencetak tidak mengubah data apa pun.
// Format struk kasir thermal 80 mm: lebar & tinggi kertas diatur useReceiptPageSize (@page, margin 0).

import { useRef } from 'react';
import { orderCostRows } from './orderCostRows';
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL, PAYMENT_OPTION, PAYMENT_STATUS, PAYMENT_STATUS_LABEL } from '../../constants/orderStatus';
import { PAY_AT_STORE_LABEL } from '../../constants/checkout';
import { formatRupiah, formatDate, formatDateShort, formatTime } from '../../utils/format';
import { parseDateKey } from '../../utils/date';
import useReceiptPageSize from '../../hooks/useReceiptPageSize';

// Garis putus-putus pemisah bagian, khas struk kasir
const SECTION = 'border-b border-dashed border-black pb-[2mm] mb-[2mm]';

const Row = ({ label, children }) => (
  <div className="flex justify-between items-baseline gap-[3mm]">
    <dt className="shrink-0">{label}</dt>
    <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
  </div>
);

/** @param {object} detail — hasil getAdminOrderDetail */
export default function OrderReceipt({ detail }) {
  const ref = useRef(null);
  useReceiptPageSize(ref);
  const { order, customer, items, payment, store } = detail;
  const unpaidAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE && order.payment_status === PAYMENT_STATUS.UNPAID;
  return (
    <article
      ref={ref}
      data-print="receipt"
      aria-label={`Struk ${order.order_number}`}
      className="hidden print:block w-[80mm] px-[4mm] py-[5mm] bg-white font-sans text-[12px] leading-[1.35] text-black"
    >
      <header className={`text-center ${SECTION}`}>
        <p className="font-display text-[17px] font-bold leading-tight">{store.name}</p>
        {store.address && <p className="text-[11px] mt-[1mm]">{store.address}</p>}
        {store.whatsapp && <p className="text-[11px]">WhatsApp {store.whatsapp}</p>}
      </header>

      <dl className={`space-y-[0.6mm] ${SECTION}`}>
        <Row label="No. Pesanan"><span className="font-bold">{order.order_number}</span></Row>
        <Row label="Tanggal">{formatDateShort(order.created_at)}, {formatTime(order.created_at)}</Row>
        <Row label="Pelanggan">{customer.name}</Row>
        <Row label={FULFILLMENT_LABEL[order.fulfillment_type]}>{formatDate(parseDateKey(order.ready_date))} · {order.time_slot}</Row>
        <Row label="Status">{ORDER_STATUS_LABEL[order.order_status]}</Row>
      </dl>

      <ul className={`space-y-[1.5mm] ${SECTION}`}>
        {items.map((item) => (
          <li key={item.order_item_id}>
            <p className="font-semibold break-words">{item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</p>
            <div className="flex justify-between gap-[3mm] tabular-nums">
              <span>{item.quantity} × {formatRupiah(item.unit_price)}</span>
              <span className="font-semibold">{formatRupiah(item.line_total)}</span>
            </div>
          </li>
        ))}
      </ul>

      <dl className="space-y-[0.6mm] mb-[2mm]">
        {orderCostRows(order).map((r) => (
          <Row key={r.label} label={r.label}>{r.discount ? '-' : ''}{formatRupiah(r.amount)}</Row>
        ))}
      </dl>
      {/* Total paling menonjol: huruf besar & tebal, diapit garis ganda */}
      <dl className="border-y-[3px] border-double border-black py-[1.5mm] mb-[2mm]">
        <div className="flex justify-between items-baseline gap-[3mm] text-[16px] font-extrabold">
          <dt className="uppercase tracking-wide">Total</dt>
          <dd className="text-right tabular-nums">{formatRupiah(order.total)}</dd>
        </div>
      </dl>

      <dl className={`space-y-[0.6mm] ${SECTION}`}>
        <Row label="Metode bayar">{payment.method_name}</Row>
        <Row label="Pembayaran"><span className="font-bold">{unpaidAtStore ? PAY_AT_STORE_LABEL : PAYMENT_STATUS_LABEL[order.payment_status]}</span></Row>
      </dl>

      <p className="text-center text-[11px]">Terima kasih — Freshly Baked, Made With Care</p>
    </article>
  );
}
