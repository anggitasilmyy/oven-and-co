// services/orderView.service.js
// FR-14 – FR-17 · C-15 – C-18 — bentuk baris orders & payments untuk respons pelanggan (snake_case seperti tabel mock).
// BIGINT → string, DECIMAL → number, kolom @db.Date → "YYYY-MM-DD", DATETIME → ISO.

const { dbDateToKey } = require('../utils/jakartaDate');

const idOrNull = (value) => (value == null ? null : String(value));
const numberOrNull = (value) => (value == null ? null : Number(value));
const isoOrNull = (value) => (value == null ? null : new Date(value).toISOString());

function mapOrder(row) {
  return {
    order_id: String(row.orderId),
    order_number: row.orderNumber,
    user_id: String(row.userId),
    fulfillment_type: row.fulfillmentType,
    address_id: idOrNull(row.addressId),
    delivery_address_snapshot: row.deliveryAddressSnapshot ?? null,
    distance_km: numberOrNull(row.distanceKm),
    ready_date: dbDateToKey(row.readyDate),
    time_slot: row.timeSlot,
    subtotal: Number(row.subtotal),
    shipping_fee: Number(row.shippingFee),
    voucher_id: idOrNull(row.voucherId),
    voucher_discount: Number(row.voucherDiscount),
    points_used: row.pointsUsed,
    points_discount: Number(row.pointsDiscount),
    total: Number(row.total),
    payment_option: row.paymentOption,
    payment_status: row.paymentStatus,
    order_status: row.orderStatus,
    pickup_code: row.pickupCode ?? null,
    courier_name: row.courierName ?? null,
    cancel_reason: row.cancelReason ?? null,
    created_at: isoOrNull(row.createdAt),
  };
}

function mapPayment(row) {
  if (!row) return null;

  return {
    payment_id: String(row.paymentId),
    order_id: String(row.orderId),
    method_code: row.methodCode,
    amount: Number(row.amount),
    gateway_ref: row.gatewayRef ?? null,
    payment_code: row.paymentCode ?? null,
    status: row.status,
    expired_at: isoOrNull(row.expiredAt),
    paid_at: isoOrNull(row.paidAt),
  };
}

module.exports = {
  mapOrder,
  mapPayment,
};
