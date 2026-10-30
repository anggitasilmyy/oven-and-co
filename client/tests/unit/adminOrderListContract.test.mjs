// Uji kontrak daftar pesanan admin (AD-03) — bug "Cannot read properties of undefined (reading 'length')" di
// PesananAdminPage: server mengirim { orders, pagination } sedangkan halaman membaca data.rows. Respons yang tidak
// sesuai kontrak harus ditolak di service (ErrorState), bukan membuat halaman crash.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOrderListPage } from '../../src/utils/rules/adminOrder.js';

const row = {
  order_id: '1', order_number: 'OVC-261020-001', created_at: '2026-10-20T01:00:00.000Z', customer_name: 'Anisa',
  fulfillment_type: 'pickup', ready_date: '2026-10-20', time_slot: '09.00–11.00', total: 56000, method_name: 'QRIS',
  order_status: 'dikonfirmasi', items_summary: 'Croissant ×2',
};
const page = (overrides = {}) => ({
  rows: [row], tabCounts: { semua: 1, dikonfirmasi: 1 }, totalFiltered: 1, page: 1, totalPages: 1, pageSize: 10, ...overrides,
});

test('kontrak getAdminOrders diterima, termasuk hasil kosong', () => {
  assert.equal(isAdminOrderListPage(page()), true);
  assert.equal(isAdminOrderListPage(page({ rows: [], totalFiltered: 0, tabCounts: { semua: 0 } })), true);
});

test('bentuk lama server { orders, pagination } ditolak (penyebab bug AD-03)', () => {
  assert.equal(isAdminOrderListPage({
    orders: [row], pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  }), false);
});

test('respons rusak/tidak lengkap ditolak', () => {
  for (const bad of [
    undefined, null, 'teks', [],
    page({ rows: undefined }), page({ rows: {} }), page({ rows: [null] }), page({ rows: [{ order_id: '1' }] }),
    page({ tabCounts: null }), page({ tabCounts: { semua: -1 } }), page({ totalFiltered: '1' }),
    page({ page: 0 }), page({ totalPages: 0 }), page({ pageSize: 0 }),
  ]) {
    assert.equal(isAdminOrderListPage(bad), false, JSON.stringify(bad));
  }
});
