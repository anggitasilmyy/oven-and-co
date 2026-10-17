// hooks/useCheckoutForm.js
// Step 5.3 · FR-12 · FR-13 · BR-01 – BR-03 · BR-09 · BR-10 · BR-12 · C-13 — state checkout & ringkasan biaya berjalan.
// Pilihan disimpan di useCheckoutStore agar dibawa ke C-14; service memvalidasi ulang saat pesanan dibuat.

import useCheckoutStore from '../stores/useCheckoutStore';
import {
  buildCheckoutQuote, buildDateOptions, getTimeSlotOptions, isSelectableDate, getOperatingHoursFor,
} from '../utils/businessRules';
import { FULFILLMENT_TYPE } from '../constants/orderStatus';
import { AVAILABILITY_TYPE } from '../constants/product';
import { TIME_SLOTS, CHECKOUT_DATE_WINDOW_DAYS, VOUCHER_INVALID_TEXT } from '../constants/checkout';

/**
 * @param {object} ctx — hasil getCheckoutContext
 * @param {object} cart — hasil useCartView
 */
export default function useCheckoutForm(ctx, cart) {
  const draft = useCheckoutStore();
  const now = new Date(ctx.now);
  const lines = cart.lines.filter((l) => l.available);
  const allReady = lines.every((l) => l.availability_type === AVAILABILITY_TYPE.READY);
  // BR-01: ready = hari ini · BR-03: campuran = tanggal item dengan persiapan terlama
  const earliest = allReady ? ctx.today_key : cart.view?.ready_date ?? ctx.today_key;
  const readyDate = allReady ? ctx.today_key : (isSelectableDate(draft.readyDate, earliest) ? draft.readyDate : earliest);
  const dateOptions = allReady ? null : buildDateOptions(ctx.today_key, earliest, CHECKOUT_DATE_WINDOW_DAYS);
  const hours = getOperatingHoursFor(ctx.operating_hours, readyDate);
  const slots = getTimeSlotOptions(TIME_SLOTS, readyDate, now, hours);
  const timeSlot = slots.find((s) => s.label === draft.timeSlot && !s.disabled)?.label ?? null;

  const isDelivery = draft.fulfillment === FULFILLMENT_TYPE.DELIVERY;
  const address = ctx.addresses.find((a) => a.address_id === draft.addressId)
    ?? ctx.addresses.find((a) => a.withinRadius) ?? ctx.addresses[0] ?? null;
  const voucherEntry = draft.voucherCode ? ctx.vouchers.find((v) => v.voucher.code === draft.voucherCode) : null;

  const quote = buildCheckoutQuote({
    lines,
    fulfillment: draft.fulfillment,
    distance: isDelivery ? address?.distance ?? null : null,
    voucherInput: voucherEntry ? { voucher: voucherEntry.voucher, claim: voucherEntry.claim } : null,
    todayKey: ctx.today_key,
    pointBalance: ctx.point_balance,
    usePoints: draft.usePoints,
    settings: ctx.settings,
  });

  let blockedReason = null;
  if (lines.length === 0 || cart.blocked) blockedReason = 'Periksa kembali keranjangmu';
  else if (isDelivery && !address) blockedReason = 'Tambahkan alamat pengiriman';
  else if (isDelivery && !address.withinRadius) blockedReason = 'Alamat di luar radius pengiriman';
  else if (quote.voucher && !quote.voucher.valid) blockedReason = VOUCHER_INVALID_TEXT;
  else if (!hours.is_open) blockedReason = 'Toko tutup pada tanggal ini. Pilih tanggal lain';
  else if (!timeSlot) blockedReason = slots.every((s) => s.disabled) ? 'Slot hari ini sudah habis' : 'Pilih slot waktu';

  /** Coba pakai voucher; false bila tidak berlaku (validation rule Voucher & poin) */
  const applyVoucher = (code) => {
    const normalized = code.trim().toUpperCase();
    const entry = ctx.vouchers.find((v) => v.voucher.code === normalized);
    const result = entry && buildCheckoutQuote({
      lines, fulfillment: draft.fulfillment, distance: null, todayKey: ctx.today_key, pointBalance: 0, usePoints: false,
      voucherInput: { voucher: entry.voucher, claim: entry.claim }, settings: ctx.settings,
    }).voucher;
    if (!result?.valid) return false;
    draft.setCheckout({ voucherCode: normalized });
    return true;
  };

  return {
    draft, lines, allReady, readyDate, dateOptions, earliest, slots, timeSlot, isDelivery, address, voucherEntry, quote,
    blockedReason, applyVoucher,
    setFulfillment: (fulfillment) => draft.setCheckout({ fulfillment }),
    setReadyDate: (d) => draft.setCheckout({ readyDate: d }),
    setTimeSlot: (label) => draft.setCheckout({ timeSlot: label }),
    setAddress: (id) => draft.setCheckout({ addressId: id }),
    removeVoucher: () => draft.setCheckout({ voucherCode: null }),
    setUsePoints: (usePoints) => draft.setCheckout({ usePoints }),
    /** Simpan pilihan final sebelum pindah ke C-14 */
    commit: () => draft.setCheckout({ readyDate, timeSlot, addressId: isDelivery ? address?.address_id ?? null : null }),
  };
}
