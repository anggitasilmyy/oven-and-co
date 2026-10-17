// components/admin/OrderPaymentCard.jsx
// Step 5.6 · FR-28 · BR-05 · AD-04 — info pembayaran ("Lunas" / "Bayar saat ambil"), rincian biaya, tombol Tandai Lunas

import { Banknote } from 'lucide-react';
import Button from '../ui/Button';
import PaymentStatusBadge from './PaymentStatusBadge';
import { orderCostRows } from './orderCostRows';
import { formatRupiah, formatDateShort, formatTime } from '../../utils/format';

/**
 * @param {object} order
 * @param {{method_name, status, paid_at}} payment
 * @param {boolean} canMarkPaid — Bayar di Toko belum lunas & Siap Diambil
 * @param {Function} onMarkPaid — buka modal konfirmasi
 */
export default function OrderPaymentCard({ order, payment, canMarkPaid, onMarkPaid }) {
  return (
    <section aria-labelledby="admin-payment-title" className="card-admin p-5 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="admin-payment-title" className="font-display text-lg text-cocoa">Pembayaran</h2>
        <PaymentStatusBadge order={order} />
      </div>
      <p className="text-sm text-cocoa">
        Metode: <span className="font-semibold">{payment.method_name}</span>
        {payment.paid_at && <span className="block text-xs text-cocoa/65 tabular-nums">Dibayar {formatDateShort(payment.paid_at)} · {formatTime(payment.paid_at)}</span>}
      </p>
      <dl className="space-y-2 text-sm">
        {orderCostRows(order).map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className="text-cocoa/70">{r.label}</dt>
            <dd className={`font-semibold tabular-nums ${r.discount ? 'text-[#3F6B3A]' : 'text-cocoa'}`}>{r.discount ? '-' : ''}{formatRupiah(r.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-3 border-t border-beige">
          <dt className="font-bold text-cocoa">Total</dt>
          <dd className="font-bold text-lg text-primary tabular-nums">{formatRupiah(order.total)}</dd>
        </div>
      </dl>
      {canMarkPaid && (
        <Button size="sm" fullWidth leftIcon={<Banknote size={16} aria-hidden="true" />} onClick={onMarkPaid}>
          Tandai Lunas
        </Button>
      )}
    </section>
  );
}
