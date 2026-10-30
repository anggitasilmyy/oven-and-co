// services/checkoutRules.service.js
// FR-12 – FR-15 · BR-03 · BR-05 · BR-09 · BR-10 · BR-12 — aturan biaya & pembayaran checkout (fungsi murni)
// Port server dari client/src/utils/rules/checkout.js (+ promo.js isVoucherActiveOn) dengan perilaku yang sama.
// distanceKm, getDeliveryQuote, dan isVoucherActiveOn dipindah dari checkout.service.js tanpa perubahan perilaku
// (versi server lebih defensif dari client: koordinat/jarak kosong → di luar radius, tanggal voucher wajib ada).
// Dipakai GET /api/checkout/context sekarang dan pembuatan pesanan (Phase 2) — server tidak memakai total dari klien.

const {
  AVAILABILITY_TYPE,
  FULFILLMENT_TYPE,
  PAY_AT_STORE_METHOD,
} = require('../utils/businessConstants');

/** Jarak garis lurus (km, 2 desimal) antara dua koordinat — haversine; null bila koordinat tidak lengkap */
function distanceKm(a, b) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }

  const values = [Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude)];

  if (!values.every(Number.isFinite)) return null;

  const rad = (degree) => (degree * Math.PI) / 180;
  const dLat = rad(values[2] - values[0]);
  const dLng = rad(values[3] - values[1]);
  const h = Math.min(
    1,
    Math.max(
      0,
      Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(values[0])) * Math.cos(rad(values[2])) * Math.sin(dLng / 2) ** 2
    )
  );

  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 100) / 100;
}

/** BR-12: ongkir = jarak dibulatkan ke atas × tarif per km; di luar radius (atau jarak tidak diketahui) → ditolak */
function getDeliveryQuote(distance, settings) {
  const withinRadius =
    distance !== null &&
    settings.delivery_radius_km != null &&
    distance <= Number(settings.delivery_radius_km);

  const fee = withinRadius ? Math.ceil(distance) * Number(settings.delivery_fee_per_km ?? 0) : 0;

  return { distance, withinRadius, fee };
}

/** Voucher aktif pada tanggal tertentu: is_active, kuota tersisa, dalam periode */
function isVoucherActiveOn(voucher, todayKey) {
  return Boolean(
    voucher.is_active &&
      voucher.quota > 0 &&
      voucher.valid_from &&
      voucher.valid_to &&
      voucher.valid_from <= todayKey &&
      todayKey <= voucher.valid_to
  );
}

/**
 * Validasi voucher (validation rule Voucher & poin; BR-10 maks. 1 voucher).
 * @param {{voucher: object|null, claim: object|null, todayKey: string, lines: Array<{product_id, line_total}>}} p
 *   voucher = baris vouchers (snake_case), claim = baris user_vouchers milik pelanggan
 * @returns {{valid: boolean, discount: number}}
 */
function evaluateVoucher({ voucher, claim, todayKey, lines }) {
  const invalid = { valid: false, discount: 0 };
  if (!voucher || !claim || claim.used_at || !isVoucherActiveOn(voucher, todayKey)) return invalid;

  // product_id kosong = semua produk; id dibandingkan sebagai string (BigInt dari DB, string dari API)
  const base = lines
    .filter((l) => voucher.product_id == null || String(l.product_id) === String(voucher.product_id))
    .reduce((sum, l) => sum + l.line_total, 0);
  if (base <= 0) return invalid;

  const discount =
    voucher.discount_type === 'percent'
      ? Math.floor((base * Number(voucher.discount_value)) / 100)
      : Math.min(Number(voucher.discount_value), base);

  return { valid: true, discount };
}

/**
 * BR-09: poin maksimal yang bisa ditukar — kelipatan redeem_points_unit, ≤ saldo, nilainya ≤ yang harus dibayar.
 * @returns {{points: number, value: number}}
 */
function getRedeemablePoints(balance, payable, settings) {
  const unit = Number(settings.redeem_points_unit);
  const value = Number(settings.redeem_value);
  const units = Math.max(0, Math.min(Math.floor(balance / unit), Math.floor(payable / value)));

  return { points: units * unit, value: units * value };
}

/** Total = subtotal + ongkir − diskon voucher − diskon poin (tidak negatif) */
function calculateOrderTotal({ subtotal, shippingFee = 0, voucherDiscount = 0, pointsDiscount = 0 }) {
  return Math.max(0, subtotal + shippingFee - voucherDiscount - pointsDiscount);
}

/** BR-03: pesanan campuran siap pada tanggal item dengan persiapan terlama */
function getCombinedReadyDate(dateKeys) {
  return dateKeys.reduce((latest, date) => (date > latest ? date : latest), dateKeys[0] ?? null);
}

/** BR-05: Bayar di Toko hanya untuk pickup dengan SEMUA item ready */
function isPayAtStoreAllowed(fulfillmentType, availabilityTypes) {
  return (
    fulfillmentType === FULFILLMENT_TYPE.PICKUP &&
    availabilityTypes.length > 0 &&
    availabilityTypes.every((type) => type === AVAILABILITY_TYPE.READY)
  );
}

/**
 * Ringkasan biaya checkout — sama dengan client buildCheckoutQuote.
 * @param {object} p
 * @param {Array<{product_id, availability_type, line_total, ready_date}>} p.lines — hanya baris yang valid
 * @param {'pickup'|'delivery'} p.fulfillment
 * @param {number|null} p.distance — jarak alamat delivery (km)
 * @param {{voucher, claim}|null} p.voucherInput — null bila tidak memakai voucher
 * @param {string} p.todayKey
 * @param {number} p.pointBalance
 * @param {boolean} p.usePoints
 * @param {object} p.settings — store_settings (snake_case)
 */
function buildCheckoutQuote({ lines, fulfillment, distance, voucherInput, todayKey, pointBalance, usePoints, settings }) {
  const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);
  const delivery = fulfillment === FULFILLMENT_TYPE.DELIVERY && distance != null ? getDeliveryQuote(distance, settings) : null;
  const shippingFee = delivery?.fee ?? 0;
  const voucher = voucherInput ? evaluateVoucher({ ...voucherInput, todayKey, lines }) : null;
  const voucherDiscount = voucher?.valid ? voucher.discount : 0;
  const redeemable = getRedeemablePoints(pointBalance, subtotal + shippingFee - voucherDiscount, settings);
  const points = usePoints ? redeemable : { points: 0, value: 0 };

  return {
    subtotal,
    delivery,
    shippingFee,
    voucher,
    voucherDiscount,
    redeemable,
    pointsUsed: points.points,
    pointsDiscount: points.value,
    total: calculateOrderTotal({ subtotal, shippingFee, voucherDiscount, pointsDiscount: points.value }),
    readyDate: getCombinedReadyDate(lines.map((l) => l.ready_date)),
    payAtStoreAllowed: isPayAtStoreAllowed(fulfillment, lines.map((l) => l.availability_type)),
  };
}

/** Alasan metode bayar ditolak */
const PAYMENT_METHOD_ERROR = Object.freeze({
  METHOD_UNAVAILABLE: 'method_unavailable',
  PAY_AT_STORE_NOT_ALLOWED: 'pay_at_store_not_allowed',
});

/**
 * Metode bayar yang dipilih: harus aktif; pay_at_store hanya bila BR-05 terpenuhi.
 * @param {Array<{method_code, method_group, is_active}>} methods
 * @returns {{method: object|null, error: string|null}}
 */
function resolvePaymentMethod(methods, methodCode, { payAtStoreAllowed }) {
  const method = methods.find((m) => m.method_code === methodCode && m.is_active) ?? null;
  if (!method) return { method: null, error: PAYMENT_METHOD_ERROR.METHOD_UNAVAILABLE };
  if (method.method_code === PAY_AT_STORE_METHOD && !payAtStoreAllowed) {
    return { method: null, error: PAYMENT_METHOD_ERROR.PAY_AT_STORE_NOT_ALLOWED };
  }
  return { method, error: null };
}

module.exports = {
  distanceKm,
  getDeliveryQuote,
  isVoucherActiveOn,
  evaluateVoucher,
  getRedeemablePoints,
  calculateOrderTotal,
  getCombinedReadyDate,
  isPayAtStoreAllowed,
  buildCheckoutQuote,
  PAYMENT_METHOD_ERROR,
  resolvePaymentMethod,
};
