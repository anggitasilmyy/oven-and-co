// components/admin/PaymentStatusBadge.jsx
// Step 4 · AD-03 — status pembayaran (SPEC §4 payment_status; Bayar di Toko = "Bayar saat ambil")

import Badge from '../ui/Badge';
import { PAYMENT_OPTION, PAYMENT_STATUS, PAYMENT_STATUS_LABEL } from '../../constants/orderStatus';

const VARIANT = {
  [PAYMENT_STATUS.PAID]: 'ready',
  [PAYMENT_STATUS.UNPAID]: 'preorder',
  [PAYMENT_STATUS.REFUNDED]: 'neutral',
};

/** @param {{payment_status, payment_option}} order */
export default function PaymentStatusBadge({ order }) {
  const payAtStore = order.payment_option === PAYMENT_OPTION.PAY_AT_STORE && order.payment_status === PAYMENT_STATUS.UNPAID;
  return (
    <Badge variant={VARIANT[order.payment_status]} className="whitespace-nowrap">
      {payAtStore ? 'Bayar saat ambil' : PAYMENT_STATUS_LABEL[order.payment_status]}
    </Badge>
  );
}
