// services/mock/seed/orderParts.js
// Step 4 · Bagian kecil pesanan contoh: nomor, jam, slot, delivery, pembayaran

import { FULFILLMENT_TYPE, ORDER_STATUS, PAYMENT_STATUS } from '../../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT } from '../../../constants/storeConfig';
import { atTime } from '../mockClock';
import { formatOrderNumber } from '../../../utils/rules/order';

/** Nomor pesanan OVC-YYMMDD-NNN (AGENTS.md §5) — Step 5.3: format dipusatkan di utils/rules/order.js */
export const buildOrderNumber = formatOrderNumber;

/** n waktu pesanan menyebar antara 07.05 dan batas akhir, urut naik */
export function buildTimes(rng, dateKey, n, end) {
  const start = atTime(dateKey, '07:05').getTime();
  const span = end.getTime() - 5 * 60000 - start;
  return Array.from({ length: n }, (_, i) => {
    const jitter = (rng.next() - 0.5) * (span / n) * 0.6;
    const t = start + (i + 0.5) * (span / n) + jitter;
    return new Date(Math.round(t / 60000) * 60000);
  });
}

const hh = (h) => `${String(h).padStart(2, '0')}.00`;
const PREORDER_SLOTS = [9, 10, 13, 15, 16];

/** Slot ambil/antar: ready = 1 jam setelah pesan (dalam jam operasional), pre-order/custom = slot pagi/sore */
export function buildSlot(rng, kind, createdAt) {
  const startHour = kind === 'ready' ? Math.min(createdAt.getHours() + 1, 19) : rng.pick(PREORDER_SLOTS);
  return `${hh(startHour)}–${hh(startHour + 1)}`;
}

const SAMPLE_ADDRESSES = [ // data contoh fiktif
  'Jl. Melati No. 12, Kel. Contoh Satu',
  'Perum Griya Asri Blok C-7, Kel. Contoh Dua',
  'Jl. Kenanga Raya No. 45, Kel. Contoh Tiga',
  'Apartemen Contoh Tower B Lt. 9, Kel. Contoh Empat',
];
const COURIERS = ['Andi (kurir toko)', 'Rizal (kurir toko)'];

/** Field delivery; ongkir = jarak dibulatkan ke atas × tarif per km (BR-12, OI-02) */
export function buildDelivery(rng, fulfillment, status) {
  if (fulfillment !== FULFILLMENT_TYPE.DELIVERY) {
    return { delivery_address_snapshot: null, distance_km: null, shipping_fee: 0, courier_name: null };
  }
  const distance = Math.round((1.2 + rng.next() * 8.4) * 100) / 100; // ≤ radius 10 km
  const withCourier = [ORDER_STATUS.DALAM_PENGIRIMAN, ORDER_STATUS.SELESAI].includes(status);
  return {
    delivery_address_snapshot: rng.pick(SAMPLE_ADDRESSES),
    distance_km: distance,
    shipping_fee: Math.ceil(distance) * STORE_SETTINGS_DEFAULT.delivery_fee_per_km,
    courier_name: withCourier ? rng.pick(COURIERS) : null,
  };
}

const ONLINE_METHODS = [
  { value: 'qris', weight: 30 }, { value: 'gopay', weight: 15 }, { value: 'ovo', weight: 8 },
  { value: 'dana', weight: 8 }, { value: 'shopeepay', weight: 9 }, { value: 'va_bca', weight: 14 },
  { value: 'va_bni', weight: 5 }, { value: 'va_mandiri', weight: 7 }, { value: 'va_bri', weight: 4 },
];

export const pickOnlineMethod = (rng) => rng.weighted(ONLINE_METHODS);

/** Baris payments sesuai status pembayaran pesanan */
export function buildPayment(order, methodCode, createdAt) {
  const expiredAt = new Date(createdAt.getTime() + STORE_SETTINGS_DEFAULT.payment_timeout_minutes * 60000);
  const status = {
    [PAYMENT_STATUS.PAID]: 'paid',
    [PAYMENT_STATUS.REFUNDED]: 'refunded',
    [PAYMENT_STATUS.UNPAID]: order.order_status === ORDER_STATUS.DIBATALKAN ? 'expired' : 'pending',
  }[order.payment_status];
  // Online lunas ±4 menit setelah pesan; Bayar di Toko lunas saat diambil (±4 jam)
  const paidDelay = methodCode === 'pay_at_store' ? 4 * 60 : 4;
  const paidAt =
    order.payment_status === PAYMENT_STATUS.UNPAID ? null : new Date(createdAt.getTime() + paidDelay * 60000);
  return {
    payment_id: order.order_id,
    order_id: order.order_id,
    method_code: methodCode,
    amount: order.total,
    gateway_ref: methodCode === 'pay_at_store' ? null : `SIM-${order.order_number}`,
    payment_code: null,
    status,
    expired_at: expiredAt.toISOString(),
    paid_at: paidAt ? paidAt.toISOString() : null,
  };
}
