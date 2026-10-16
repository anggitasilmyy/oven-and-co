// services/orderService.js
// Step 5.3 · FR-12 – FR-16 · BR-05 · BR-06 · C-14 – C-16 — buat pesanan, halaman bayar, ganti metode, pesanan berhasil.
// Hanya pelanggan login (BR-04) dan hanya pesanan miliknya. Pembatalan otomatis 30 menit (BR-06) dijalankan
// saat pesanan dibaca — pengganti job autoCancelOrders (Step 6.5).

import { apiClient } from './apiClient';
import { getTables, updateTable } from './mock/db';
import { isUserRow } from './mock/userRows';
import { getMockCurrentTime } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { createMockOrder } from './mock/orderWrites';
import { cancelOrder, paymentCodeFor } from './mock/orderEffects';
import { getPaymentSecondsLeft, pointsEarnedFor, isPayAtStoreAllowed } from '../utils/businessRules';
import { ROLES } from '../constants/roles';
import { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_OPTION } from '../constants/orderStatus';
import { PAY_AT_STORE_METHOD, PAYMENT_TIMEOUT_CANCEL_REASON, PAY_AT_STORE_DISABLED_TEXT } from '../constants/checkout';

/** BR-06: pesanan online pelanggan yang belum lunas setelah 30 menit dibatalkan otomatis (stok kembali) */
function expireOverdueOrders() {
  const { orders, payments } = getTables('orders', 'payments');
  const now = getMockCurrentTime();
  orders
    .filter((o) => isUserRow(o, 'order_id') && o.order_status === ORDER_STATUS.MENUNGGU_PEMBAYARAN)
    .forEach((o) => {
      const payment = payments.find((p) => p.order_id === o.order_id);
      if (payment && getPaymentSecondsLeft(payment.expired_at, now) === 0) {
        cancelOrder(o, { cancelReason: PAYMENT_TIMEOUT_CANCEL_REASON, paymentRowStatus: 'expired' });
      }
    });
}

/** Pesanan milik pelanggan login + data terkait; lempar error bila tidak ditemukan */
function findMyOrder(orderNumber) {
  const user = requireMockRole(ROLES.CUSTOMER);
  expireOverdueOrders();
  const t = getTables('orders', 'order_items', 'payments', 'payment_methods', 'products');
  const order = t.orders.find((o) => o.order_number === orderNumber && o.user_id === user.user_id);
  if (!order) throw new Error('Pesanan tidak ditemukan');
  const payment = t.payments.find((p) => p.order_id === order.order_id);
  const items = t.order_items.filter((i) => i.order_id === order.order_id);
  return { order, payment, items, t };
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
      return { order_number: orderNumber };
    },
  });
}
