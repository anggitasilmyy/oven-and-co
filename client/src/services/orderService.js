// services/orderService.js
// Step 5.3 · FR-12 – FR-16 · BR-05 · BR-06 · C-14 – C-16 — buat pesanan, halaman bayar, ganti metode, pesanan berhasil.
// Hanya pelanggan login (BR-04) dan hanya pesanan miliknya. Pembatalan otomatis 30 menit (BR-06) dijalankan
// terpusat di getTables (mock/db.js → mock/orderCancellation.js) — pengganti job autoCancelOrders (Step 6.5).
// Step 5.4: perubahan status (lunas, ganti ke Bayar di Toko) dicatat di order_status_histories.

import { apiClient } from './apiClient';
import { updateTable } from './mock/db';
import { getMockCurrentTime } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { findMyOrder } from './mock/myOrders';
import { appendStatusHistory } from './mock/statusHistory';
import { createMockOrder } from './mock/orderWrites';
import { paymentCodeFor } from './mock/orderEffects';
import { getPaymentSecondsLeft, pointsEarnedFor, isPayAtStoreAllowed } from '../utils/businessRules';
import { ROLES } from '../constants/roles';
import { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION } from '../constants/orderStatus';
import { PAY_AT_STORE_METHOD, PAY_AT_STORE_DISABLED_TEXT } from '../constants/checkout';

/** Catat perubahan status di order_status_histories (SPEC §4) */
function recordStatus(order, status, changedBy) {
  updateTable('order_status_histories', (rows) => appendStatusHistory(rows, [{
    order_id: order.order_id, status, changed_by: changedBy, changed_at: getMockCurrentTime().toISOString(),
  }]));
}

/** Bentuk data halaman Bayar / Pesanan Berhasil */
function toPaymentView({ order, payment, items, t }) {
  const method = t.payment_methods.find((m) => m.method_code === payment?.method_code) ?? null;
  const types = items.map((i) => t.products.find((p) => p.product_id === i.product_id)?.availability_type);
  return {
    order,
    payment,
    method,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    seconds_left: payment ? getPaymentSecondsLeft(payment.expired_at, getMockCurrentTime()) : 0,
    points_to_earn: pointsEarnedFor(order.total),
    pay_at_store_allowed: isPayAtStoreAllowed(order.fulfillment_type, types),
  };
}

/**
 * Buat pesanan dari keranjang + pilihan checkout + metode bayar.
 * @returns {Promise<{order_number, payment_option}>}
 */
export function createOrder(input) {
  return apiClient('/orders', {
    method: 'POST',
    body: input,
    mockHandler: () => createMockOrder(requireMockRole(ROLES.CUSTOMER), input),
  });
}

/** @returns {Promise<object>} data C-15 / C-16 */
export function getOrderPayment(orderNumber) {
  return apiClient(`/orders/${orderNumber}/payment`, { mockHandler: () => toPaymentView(findMyOrder(orderNumber)) });
}

/** Ganti metode pembayaran pesanan yang masih Menunggu Pembayaran (tombol "Ganti Metode" C-15) */
export function changePaymentMethod(orderNumber, methodCode) {
  return apiClient(`/orders/${orderNumber}/payment`, {
    method: 'PATCH',
    body: { method_code: methodCode },
    mockHandler: () => {
      const found = findMyOrder(orderNumber);
      const { order, t } = found;
      if (order.order_status !== ORDER_STATUS.MENUNGGU_PEMBAYARAN) throw new Error('Pesanan tidak lagi menunggu pembayaran');
      const method = t.payment_methods.find((m) => m.method_code === methodCode && m.is_active);
      if (!method) throw new Error('Pilih metode pembayaran');
      const payAtStore = method.method_code === PAY_AT_STORE_METHOD;
      if (payAtStore && !toPaymentView(found).pay_at_store_allowed) throw new Error(PAY_AT_STORE_DISABLED_TEXT);
      updateTable('payments', (rows) => rows.map((p) => (p.order_id === order.order_id
        ? { ...p, method_code: method.method_code, payment_code: paymentCodeFor(method, order), gateway_ref: payAtStore ? null : p.gateway_ref }
        : p)));
      if (payAtStore) {
        updateTable('orders', (rows) => rows.map((o) => (o.order_id === order.order_id
          ? { ...o, payment_option: PAYMENT_OPTION.PAY_AT_STORE, order_status: ORDER_STATUS.DIKONFIRMASI } : o)));
        recordStatus(order, ORDER_STATUS.DIKONFIRMASI, found.user.user_id);
      }
      return { order_number: orderNumber, payment_option: payAtStore ? PAYMENT_OPTION.PAY_AT_STORE : PAYMENT_OPTION.ONLINE };
    },
  });
}

/**
 * Simulasi webhook payment gateway "lunas" — hanya mode development (SPEC §10).
 * Lunas → status Dikonfirmasi (SPEC §4).
 */
export function simulatePaymentPaid(orderNumber) {
  return apiClient(`/payments/${orderNumber}/simulate-paid`, {
    method: 'POST',
    mockHandler: () => {
      if (!import.meta.env.DEV) throw new Error('Simulasi hanya tersedia di mode development');
      const { order } = findMyOrder(orderNumber);
      if (order.order_status !== ORDER_STATUS.MENUNGGU_PEMBAYARAN) throw new Error('Pesanan tidak lagi menunggu pembayaran');
      const paidAt = getMockCurrentTime().toISOString();
      updateTable('payments', (rows) => rows.map((p) => (p.order_id === order.order_id ? { ...p, status: 'paid', paid_at: paidAt } : p)));
      updateTable('orders', (rows) => rows.map((o) => (o.order_id === order.order_id
        ? { ...o, payment_status: PAYMENT_STATUS.PAID, order_status: ORDER_STATUS.DIKONFIRMASI } : o)));
      recordStatus(order, ORDER_STATUS.DIKONFIRMASI, null); // webhook payment gateway = sistem
      return { order_number: orderNumber };
    },
  });
}
