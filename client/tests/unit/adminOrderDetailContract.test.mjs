// Uji kontrak detail pesanan admin (AD-04) — bug skeleton tanpa akhir di DetailPesananAdminPage: server mengirim dump
// Prisma { order: { orderNumber, … } } sehingga data.order.order_number tidak pernah cocok. Respons yang tidak sesuai
// kontrak kini ditolak di service (ErrorState + Coba lagi), bukan menahan halaman di skeleton.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOrderDetail } from '../../src/utils/rules/adminOrder.js';

const detail = (overrides = {}) => ({
  order: { order_number: 'OVC-261029-002', order_status: 'dikonfirmasi', has_pickup_code: false },
  customer: { name: 'Angellica', email: 'angel@gmail.com', phone: '+621111222234' },
  items: [{ order_item_id: '15', name: 'Sourdough Country Loaf', quantity: 2, unit_price: 65000, line_total: 130000, design_spec: null }],
  payment: { method_name: 'GoPay', status: 'paid', paid_at: '2026-10-29T15:38:31.000Z', amount: 155000 },
  status_log: [{ history_id: '34', status: 'dikonfirmasi', changed_by_name: 'Sistem' }],
  store: { name: 'Oven & Co.', address: null, whatsapp: null },
  actions: { next_status: 'sedang_disiapkan', completion_blocked: null, requires_pickup_code: false, requires_courier: false, can_mark_paid: false },
  ...overrides,
});

test('kontrak AD-04 diterima (termasuk tanpa item/riwayat)', () => {
  assert.equal(isAdminOrderDetail(detail()), true);
  assert.equal(isAdminOrderDetail(detail({ items: [], status_log: [] })), true);
});

test('bentuk lama server (dump Prisma camelCase di data.order) ditolak — penyebab skeleton tanpa akhir', () => {
  assert.equal(isAdminOrderDetail({
    order: {
      orderId: '11', orderNumber: 'OVC-261029-002', orderStatus: 'dikonfirmasi',
      items: [], payments: [], statusHistories: [], user: { name: 'Angellica' },
    },
  }), false);
});

test('respons rusak/tidak lengkap ditolak', () => {
  for (const bad of [
    undefined, null, [], 'teks',
    detail({ order: null }), detail({ order: { order_number: 1, order_status: 'x' } }), detail({ order: { order_number: 'OVC-1' } }),
    detail({ customer: undefined }), detail({ payment: null }), detail({ store: [] }), detail({ actions: undefined }),
    detail({ items: undefined }), detail({ items: [null] }), detail({ status_log: {} }),
  ]) {
    assert.equal(isAdminOrderDetail(bad), false, JSON.stringify(bad));
  }
});
