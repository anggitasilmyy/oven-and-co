// services/adminOrderService.js
// Step 4 · FR-28 (bagian daftar) · AD-03 — daftar pesanan admin dengan tab status & filter
// Staf & Owner (FR-26).
// Step 5.6 · AD-04 · AD-05: detail pesanan, ubah status, verifikasi kode pickup, tandai lunas, kalender produksi.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { requireMockRole } from './mock/mockSession';
import { getAdminOrderRows } from './mock/orderViews';
import { findAdminOrder, toAdminOrderDetail } from './mock/adminOrderViews';
import { changeAdminOrderStatus, verifyAdminPickupCode, markAdminOrderPaid } from './mock/adminOrderWrites';
import { buildProductionCalendar } from './mock/productionViews';
import { ROLES } from '../constants/roles';
import { ORDER_STATUS_TABS } from '../constants/orderStatus';
import { ADMIN_ORDERS_PAGE_SIZE } from '../constants/dashboard';
import { dateKeyOf } from '../utils/date';

const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];

/** Filter selain tab status — jumlah per tab dihitung setelah filter ini (angka konsisten) */
function matchesFilters(row, { search, dateFrom, dateTo, fulfillment, methodCode }) {
  const dateKey = dateKeyOf(row.created_at);
  if (search && !row.order_number.toLowerCase().includes(search.trim().toLowerCase())) return false;
  if (dateFrom && dateKey < dateFrom) return false;
  if (dateTo && dateKey > dateTo) return false;
  if (fulfillment && row.fulfillment_type !== fulfillment) return false;
  if (methodCode && row.method_code !== methodCode) return false;
  return true;
}

function toQuery(params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return q.toString();
}

/**
 * @param {{tab?, search?, dateFrom?, dateTo?, fulfillment?, methodCode?, page?}} params
 * @returns {Promise<{rows, tabCounts, totalFiltered, page, totalPages, pageSize}>}
 */
export function getAdminOrders(params = {}) {
  return apiClient(`/admin/orders?${toQuery(params)}`, {
    mockHandler: () => {
      requireMockRole(...ADMIN_ROLES);
      const filtered = getAdminOrderRows().filter((row) => matchesFilters(row, params));
      const tabCounts = Object.fromEntries(
        ORDER_STATUS_TABS.map((t) => [
          t.key,
          t.statuses.length ? filtered.filter((r) => t.statuses.includes(r.order_status)).length : filtered.length,
        ])
      );
      const tab = ORDER_STATUS_TABS.find((t) => t.key === params.tab) ?? ORDER_STATUS_TABS[0];
      const inTab = tab.statuses.length ? filtered.filter((r) => tab.statuses.includes(r.order_status)) : filtered;
      const pageSize = ADMIN_ORDERS_PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(inTab.length / pageSize));
      const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
      return {
        rows: inTab.slice((page - 1) * pageSize, page * pageSize),
        tabCounts,
        totalFiltered: inTab.length,
        page,
        totalPages,
        pageSize,
      };
    },
  });
}

/** Metode pembayaran aktif untuk filter */
export function getPaymentMethods() {
  return apiClient('/payment-methods', {
    mockHandler: () => {
      requireMockRole(...ADMIN_ROLES);
      return getTables('payment_methods').payment_methods.filter((m) => m.is_active);
    },
  });
}

// ── Step 5.6 · FR-28 · FR-29 · AD-04 · AD-05 ─────────────────────────────────

/** AD-04: detail pesanan mana pun (Staf/Owner). Kode pickup tidak ikut dikirim. */
export function getAdminOrderDetail(orderNumber) {
  return apiClient(`/admin/orders/${orderNumber}`, {
    mockHandler: () => toAdminOrderDetail(findAdminOrder(orderNumber)),
  });
}

/**
 * Ubah status satu langkah sesuai urutan SPEC §4 (divalidasi di service, bukan hanya di UI).
 * @param {string} orderNumber
 * @param {{from: string, to: string, pickup_code?: string, courier_name?: string}} input
 *   from = status yang dilihat admin (klik ganda / data basi ditolak)
 */
export function updateAdminOrderStatus(orderNumber, input) {
  return apiClient(`/admin/orders/${orderNumber}/status`, {
    method: 'PATCH',
    body: input,
    mockHandler: () => changeAdminOrderStatus(orderNumber, input),
  });
}

/** UC-21: cek kode pickup tanpa mengubah data */
export function verifyPickupCode(orderNumber, code) {
  return apiClient(`/admin/orders/${orderNumber}/verify-pickup`, {
    method: 'POST',
    body: { pickup_code: code },
    mockHandler: () => verifyAdminPickupCode(orderNumber, code),
  });
}

/** FR-28: tandai pembayaran Bayar di Toko lunas */
export function markOrderPaid(orderNumber) {
  return apiClient(`/admin/orders/${orderNumber}/mark-paid`, {
    method: 'PATCH',
    mockHandler: () => markAdminOrderPaid(orderNumber),
  });
}

/**
 * AD-05: kalender produksi bulan tertentu + daftar produksi tanggal terpilih (kosong = hari ini).
 * @param {string|null} monthKey — "YYYY-MM"
 * @param {string|null} dateKey — "YYYY-MM-DD"
 */
export function getProductionCalendar(monthKey, dateKey) {
  return apiClient(`/admin/calendar?${toQuery({ month: monthKey, date: dateKey })}`, {
    mockHandler: () => buildProductionCalendar(monthKey, dateKey),
  });
}
