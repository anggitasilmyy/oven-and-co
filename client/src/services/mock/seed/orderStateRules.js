// services/mock/seed/orderStateRules.js
// Step 4 · Menentukan status pesanan contoh agar konsisten dengan SPEC §4 & BR-05 – BR-08
// relatif terhadap "sekarang" mock (hari ini pukul MOCK_REFERENCE_TIME).

import { ORDER_STATUS as S, PAYMENT_STATUS as P, PAYMENT_OPTION, FULFILLMENT_TYPE } from '../../../constants/orderStatus';
import { STORE_SETTINGS_DEFAULT } from '../../../constants/storeConfig';

const TIMEOUT = STORE_SETTINGS_DEFAULT.payment_timeout_minutes;
const CANCEL_RATE = 0.07;

/** Status "siap" sesuai fulfillment */
const readyStatus = (fulfillment) =>
  fulfillment === FULFILLMENT_TYPE.PICKUP ? S.SIAP_DIAMBIL : S.DALAM_PENGIRIMAN;

/**
 * @param {object} p
 * @param {'ready'|'preorder'|'custom'} p.kind
 * @param {number} p.ageMinutes — umur pesanan terhadap "sekarang" mock
 * @param {number} p.readyCompare — ready_date dibanding hari ini: -1 lampau, 0 hari ini, 1 mendatang
 */
function decideStatus({ kind, ageMinutes, readyCompare, fulfillment, paymentOption, rng }) {
  const online = paymentOption === PAYMENT_OPTION.ONLINE;
  const cancelled = rng.next() < CANCEL_RATE;

  if (online && ageMinutes <= TIMEOUT) return S.MENUNGGU_PEMBAYARAN; // BR-06 belum lewat batas
  if (cancelled) return S.DIBATALKAN;
  if (readyCompare < 0) return S.SELESAI;
  if (readyCompare > 0) return S.DIKONFIRMASI;

  // Siap hari ini
  if (kind !== 'ready') return rng.next() < 0.5 ? S.SEDANG_DISIAPKAN : readyStatus(fulfillment);
  if (ageMinutes <= 75) return S.DIKONFIRMASI;
  if (ageMinutes <= 150) return S.SEDANG_DISIAPKAN;
  if (ageMinutes <= 260) return readyStatus(fulfillment);
  return S.SELESAI;
}

/** Status pembayaran & alasan batal sesuai status pesanan */
function decidePayment({ status, paymentOption, readyCompare, rng }) {
  const online = paymentOption === PAYMENT_OPTION.ONLINE;
  if (status === S.MENUNGGU_PEMBAYARAN) return { payment_status: P.UNPAID, cancel_reason: null };
  if (status === S.DIBATALKAN) {
    if (!online) {
      return readyCompare < 0
        ? { payment_status: P.UNPAID, cancel_reason: 'Tidak diambil sampai jam tutup (BR-07)' }
        : { payment_status: P.UNPAID, cancel_reason: 'Dibatalkan pelanggan' };
    }
    return rng.next() < 0.5
      ? { payment_status: P.UNPAID, cancel_reason: 'Tidak dibayar dalam 30 menit (BR-06)' }
      : { payment_status: P.REFUNDED, cancel_reason: 'Dibatalkan pelanggan sebelum disiapkan (BR-08)' };
  }
  if (online) return { payment_status: P.PAID, cancel_reason: null };
  // Bayar di Toko wajib ditandai lunas sebelum Selesai
  return { payment_status: status === S.SELESAI ? P.PAID : P.UNPAID, cancel_reason: null };
}

export function decideOrderState(params) {
  const order_status = decideStatus(params);
  return { order_status, ...decidePayment({ ...params, status: order_status }) };
}
