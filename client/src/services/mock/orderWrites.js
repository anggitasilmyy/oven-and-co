// services/mock/orderWrites.js
// Step 5.3 · FR-12 – FR-16 · BR-01 – BR-06 · BR-10 · TF-12 — pembuatan pesanan di mode mock (pengganti API Step 6.3)
// Step 5.4: status awal pesanan dicatat di order_status_histories.
// Step 5.5: lewat recordOrderStatus sehingga pelanggan juga menerima notifikasi "Pesanan dibuat/dikonfirmasi".
// Semua aturan divalidasi ulang di sini; UI hanya mengirim pilihan pelanggan.

import { getTables, updateTable, nextUserRowId } from './db';
import { getMockTodayKey, getMockCurrentTime } from './mockClock';
import { buildCartLines, CART_VIEW_TABLES } from './cartViews';
import { addStockSold, paymentCodeFor, randomDigits, recordOrderStatus } from './orderEffects';
import {
  buildCheckoutQuote, findStockIssues, distanceKm, getTimeSlotOptions, nextOrderNumber, getPointBalance,
} from '../../utils/businessRules';
import { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION, FULFILLMENT_TYPE } from '../../constants/orderStatus';
import { TIME_SLOTS, PAY_AT_STORE_METHOD, VOUCHER_INVALID_TEXT, PAY_AT_STORE_DISABLED_TEXT } from '../../constants/checkout';
import { AVAILABILITY_TYPE } from '../../constants/product';

const fail = (message) => { throw new Error(message); };

/** Validasi semua aturan checkout lalu hitung ringkasan biaya */
function validate(user, input, t) {
  const lines = buildCartLines(input.items, t);
  if (lines.length === 0) fail('Keranjang masih kosong');
  if (lines.some((l) => !l.available)) fail('Ada produk yang sudah tidak tersedia. Hapus dari keranjang.');
  if (findStockIssues(lines).length) fail('Stok produk ready tidak mencukupi. Periksa keranjang.');

  const now = getMockCurrentTime();
  const todayKey = getMockTodayKey();
  const allReady = lines.every((l) => l.availability_type === AVAILABILITY_TYPE.READY);
  const earliest = lines.reduce((m, l) => (l.ready_date > m ? l.ready_date : m), todayKey);
  if (allReady ? input.ready_date !== todayKey : input.ready_date < earliest) fail('Tanggal ambil/antar tidak valid');
  const slot = getTimeSlotOptions(TIME_SLOTS, input.ready_date, now).find((s) => s.label === input.time_slot);
  if (!slot || slot.disabled) fail('Pilih slot waktu dalam jam operasional');

  let address = null;
  if (input.fulfillment === FULFILLMENT_TYPE.DELIVERY) {
    address = t.addresses.find((a) => a.address_id === input.address_id && a.user_id === user.user_id) ?? fail('Pilih alamat pengiriman');
  }
  const claim = input.voucher_code
    ? t.user_vouchers.find((c) => c.user_id === user.user_id && t.vouchers.find((v) => v.voucher_id === c.voucher_id)?.code === input.voucher_code)
    : null;
  const quote = buildCheckoutQuote({
    lines, fulfillment: input.fulfillment, distance: address ? distanceKm(t.store_settings, address) : null,
    voucherInput: input.voucher_code ? { voucher: t.vouchers.find((v) => v.voucher_id === claim?.voucher_id), claim } : null,
    todayKey, settings: t.store_settings, usePoints: input.use_points,
    pointBalance: getPointBalance(t.point_transactions.filter((tx) => tx.user_id === user.user_id)),
  });
  if (address && !quote.delivery.withinRadius) fail(`Alamat di luar radius pengiriman ${t.store_settings.delivery_radius_km} km`);
  if (quote.voucher && !quote.voucher.valid) fail(VOUCHER_INVALID_TEXT);
  const method = t.payment_methods.find((m) => m.method_code === input.method_code && m.is_active) ?? fail('Pilih metode pembayaran');
  if (method.method_code === PAY_AT_STORE_METHOD && !quote.payAtStoreAllowed) fail(PAY_AT_STORE_DISABLED_TEXT);
  return { lines, quote, address, claim, method, now, todayKey };
}

/**
 * Buat pesanan + item + pembayaran; kurangi stok ready (TF-12), tandai voucher terpakai, catat poin ditukar.
 * @returns {{order_number, payment_option}}
 */
export function createMockOrder(user, input) {
  const t = getTables(...CART_VIEW_TABLES, 'orders', 'order_items', 'payments', 'payment_methods', 'addresses', 'vouchers', 'user_vouchers', 'point_transactions');
  const { lines, quote, address, claim, method, now, todayKey } = validate(user, input, t);
  const payAtStore = method.method_code === PAY_AT_STORE_METHOD;
  const orderId = nextUserRowId(t.orders, 'order_id');
  const order = {
    order_id: orderId,
    order_number: nextOrderNumber(t.orders.map((o) => o.order_number), todayKey),
    user_id: user.user_id,
    fulfillment_type: input.fulfillment,
    address_id: address?.address_id ?? null,
    delivery_address_snapshot: address ? `${address.label} · ${address.recipient_name} (${address.recipient_phone}) · ${address.full_address}` : null,
    distance_km: quote.delivery?.distance ?? null,
    ready_date: input.ready_date,
    time_slot: input.time_slot,
    subtotal: quote.subtotal,
    shipping_fee: quote.shippingFee,
    voucher_id: claim?.voucher_id ?? null,
    voucher_discount: quote.voucherDiscount,
    points_used: quote.pointsUsed,
    points_discount: quote.pointsDiscount,
    total: quote.total,
    payment_option: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE,
    payment_status: PAYMENT_STATUS.UNPAID,
    // Online → menunggu pembayaran; Bayar di Toko → langsung dikonfirmasi (SPEC §4)
    order_status: payAtStore ? ORDER_STATUS.DIKONFIRMASI : ORDER_STATUS.MENUNGGU_PEMBAYARAN,
    pickup_code: input.fulfillment === FULFILLMENT_TYPE.PICKUP ? `PK${randomDigits(4)}` : null,
    courier_name: null,
    cancel_reason: null,
    created_at: now.toISOString(),
  };
  const firstItemId = nextUserRowId(t.order_items, 'order_item_id');
  const items = lines.map((l, i) => ({
    order_item_id: firstItemId + i, order_id: orderId, product_id: l.product_id, variant_id: l.variant_id,
    design_id: l.design_id, quantity: l.quantity, unit_price: l.unit_price, note: l.note || null,
  }));
  const timeout = t.store_settings.payment_timeout_minutes;
  const payment = {
    payment_id: nextUserRowId(t.payments, 'payment_id'), order_id: orderId, method_code: method.method_code,
    amount: order.total, gateway_ref: payAtStore ? null : `SIM-${order.order_number}`,
    payment_code: paymentCodeFor(method, order), status: 'pending',
    expired_at: new Date(now.getTime() + timeout * 60000).toISOString(), paid_at: null,
  };

  updateTable('orders', (rows) => [...rows, order]);
  updateTable('order_items', (rows) => [...rows, ...items]);
  updateTable('payments', (rows) => [...rows, payment]);
  // Step 5.4: status awal dicatat di riwayat status (SPEC §4) · Step 5.5: + notifikasi (FR-18)
  recordOrderStatus(order, order.order_status, { changedBy: user.user_id, at: order.created_at });
  addStockSold(lines, todayKey, 1);
  if (claim) {
    updateTable('user_vouchers', (rows) => rows.map((c) => (c.user_id === claim.user_id && c.voucher_id === claim.voucher_id ? { ...c, used_at: order.created_at } : c)));
    updateTable('vouchers', (rows) => rows.map((v) => (v.voucher_id === claim.voucher_id ? { ...v, quota: Math.max(0, v.quota - 1) } : v)));
  }
  if (quote.pointsUsed > 0) {
    updateTable('point_transactions', (rows) => [...rows, {
      point_tx_id: nextUserRowId(rows, 'point_tx_id'), user_id: user.user_id, type: 'redeem',
      points: -quote.pointsUsed, order_id: orderId, review_id: null, created_at: order.created_at,
    }]);
  }
  return { order_number: order.order_number, payment_option: order.payment_option };
}
