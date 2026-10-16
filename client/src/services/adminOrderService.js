// services/adminOrderService.js
// Step 4 · FR-28 (bagian daftar) · AD-03 — daftar pesanan admin dengan tab status & filter
// Staf & Owner (FR-26). Ubah status, detail, dan cetak struk dikerjakan di Step 5.6.

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { requireMockRole } from './mock/mockSession';
import { getAdminOrderRows } from './mock/orderViews';
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
