// utils/rules/checkout.js
// FR-11 – FR-15 · BR-01 · BR-03 · BR-05 · BR-06 · BR-09 · BR-10 · BR-12 — aturan keranjang, checkout, pembayaran
// Fungsi murni; dipakai UI (ringkasan berjalan) dan service (validasi ulang sebelum pesanan dibuat).

import { AVAILABILITY_TYPE } from '../../constants/product';
import { FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT, OPERATING_HOURS_DEFAULT } from '../../constants/storeConfig';
import { getEarliestReadyDate } from './readyDate';
import { isVoucherActiveOn } from './promo';
import { toDateKey } from '../date';

/**
 * Tanggal siap satu item keranjang: ready = hari ini (BR-01); pre-order/custom = tanggal pilihan pelanggan,
 * tetapi tidak pernah lebih awal dari tanggal siap tercepat saat ini (BR-02).
 */
export function getCartItemReadyDate(item, product, now, settings = STORE_SETTINGS_DEFAULT) {
  const earliest = getEarliestReadyDate(product, now, settings);
  if (product.availability_type === AVAILABILITY_TYPE.READY) return earliest;
  return item.preferred_date && item.preferred_date > earliest ? item.preferred_date : earliest;
}

/** BR-03: pesanan campuran siap pada tanggal item dengan persiapan terlama */
export function getCombinedReadyDate(dateKeys) {
  return dateKeys.reduce((max, d) => (d > max ? d : max), dateKeys[0] ?? null);
}

/** BR-05: Bayar di Toko hanya untuk pickup dengan SEMUA item ready */
export function isPayAtStoreAllowed(fulfillmentType, availabilityTypes) {
  return (
    fulfillmentType === FULFILLMENT_TYPE.PICKUP &&
    availabilityTypes.length > 0 &&
    availabilityTypes.every((t) => t === AVAILABILITY_TYPE.READY)
  );
}

/** Jumlah produk ready di keranjang melebihi sisa stok hari ini → daftar product_id bermasalah */
export function findStockIssues(lines) {
  const totals = new Map();
  for (const l of lines) {
    if (l.availability_type !== AVAILABILITY_TYPE.READY) continue;
    const t = totals.get(l.product_id) ?? { qty: 0, remaining: l.remaining_today ?? 0 };
    totals.set(l.product_id, { ...t, qty: t.qty + l.quantity });
  }
  return [...totals].filter(([, t]) => t.qty > t.remaining).map(([pid, t]) => ({ product_id: pid, remaining: t.remaining }));
}

/** Jarak garis lurus (km, 2 desimal) antara dua koordinat — haversine */
export function distanceKm(a, b) {
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 100) / 100;
}

/** BR-12: ongkir = jarak dibulatkan ke atas × tarif per km; radius maksimal diatur admin */
export function getDeliveryQuote(distance, settings = STORE_SETTINGS_DEFAULT) {
  const withinRadius = distance <= Number(settings.delivery_radius_km);
  return { distance, withinRadius, fee: withinRadius ? Math.ceil(distance) * Number(settings.delivery_fee_per_km) : 0 };
}

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Label slot "09.00–11.00" (orders.time_slot) */
export const formatTimeSlot = (slot) => `${slot.start.replace(':', '.')}–${slot.end.replace(':', '.')}`;

/**
 * Slot dalam jam operasional; untuk hari ini slot yang sudah dimulai dinonaktifkan (validation rule Checkout).
 * @returns {Array<{start, end, label, disabled}>}
 */
export function getTimeSlotOptions(slots, dateKey, now, hours = OPERATING_HOURS_DEFAULT) {
  const isToday = dateKey === toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slots
    .filter((s) => minutesOf(s.start) >= minutesOf(hours.open_time) && minutesOf(s.end) <= minutesOf(hours.close_time))
    .map((s) => ({ ...s, label: formatTimeSlot(s), disabled: isToday && minutesOf(s.start) <= nowMinutes }));
}

/**
 * Validasi voucher (validation rule Voucher & poin; BR-10 maks. 1 voucher).
 * @param {object|null} voucher — baris vouchers
 * @param {object|null} claim — baris user_vouchers milik pelanggan
 * @param {Array<{product_id, line_total}>} lines
 * @returns {{valid: boolean, discount: number}}
 */
export function evaluateVoucher({ voucher, claim, todayKey, lines }) {
  const invalid = { valid: false, discount: 0 };
  if (!voucher || !claim || claim.used_at || !isVoucherActiveOn(voucher, todayKey)) return invalid;
  const base = lines
    .filter((l) => voucher.product_id == null || l.product_id === voucher.product_id)
    .reduce((s, l) => s + l.line_total, 0);
  if (base <= 0) return invalid;
  const discount =
    voucher.discount_type === 'percent'
      ? Math.floor((base * Number(voucher.discount_value)) / 100)
      : Math.min(Number(voucher.discount_value), base);
  return { valid: true, discount };
}

/**
 * Poin maksimal yang bisa ditukar: kelipatan 100 poin, ≤ saldo, nilainya tidak melebihi yang harus dibayar.
 * @returns {{points, value}}
 */
export function getRedeemablePoints(balance, payable, settings = STORE_SETTINGS_DEFAULT) {
  const units = Math.max(0, Math.min(
    Math.floor(balance / settings.redeem_points_unit),
    Math.floor(payable / settings.redeem_value),
  ));
  return { points: units * settings.redeem_points_unit, value: units * settings.redeem_value };
}

/** Total = subtotal + ongkir − diskon voucher − diskon poin (tidak negatif) */
export function calculateOrderTotal({ subtotal, shippingFee = 0, voucherDiscount = 0, pointsDiscount = 0 }) {
  return Math.max(0, subtotal + shippingFee - voucherDiscount - pointsDiscount);
}

/**
 * Ringkasan biaya checkout (dipakai UI untuk ringkasan berjalan dan service untuk validasi ulang).
 * @param {object} p
 * @param {Array<{product_id, availability_type, line_total, ready_date}>} p.lines
 * @param {'pickup'|'delivery'} p.fulfillment
 * @param {number|null} p.distance — jarak alamat delivery (km)
 * @param {{voucher, claim}|null} p.voucherInput
 * @param {number} p.pointBalance
 * @param {boolean} p.usePoints
 */
export function buildCheckoutQuote({ lines, fulfillment, distance, voucherInput, todayKey, pointBalance, usePoints, settings = STORE_SETTINGS_DEFAULT }) {
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
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
