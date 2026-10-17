// components/admin/orderCostRows.js
// Step 5.6 · FR-28 · AD-04 — baris rincian biaya pesanan (dipakai kartu pembayaran & struk)

import { FULFILLMENT_TYPE } from '../../constants/orderStatus';

/** Rincian biaya dari salinan nilai pesanan (SPEC §8) */
export function orderCostRows(order) {
  return [
    { label: 'Subtotal', amount: order.subtotal },
    ...(order.fulfillment_type === FULFILLMENT_TYPE.DELIVERY ? [{ label: 'Ongkir', amount: order.shipping_fee }] : []),
    ...(order.voucher_discount > 0 ? [{ label: 'Diskon voucher', amount: order.voucher_discount, discount: true }] : []),
    ...(order.points_discount > 0 ? [{ label: `Tukar ${order.points_used} poin`, amount: order.points_discount, discount: true }] : []),
  ];
}
