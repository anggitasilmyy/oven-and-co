// Step 6.4.6 · FR-27 · AD-02 — aturan murni penjualan (port client utils/rules/sales.js) di services/salesRules.service.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSalesOrder, lastNDateKeys, aggregateDailySales, percentChange, countOrdersByStatus, countNeedsProcessing, isLowStock,
} = require('../src/services/salesRules.service');

const order = (createdAt, total, paymentStatus = 'paid', orderStatus = 'selesai') => ({
  created_at: new Date(createdAt), total, payment_status: paymentStatus, order_status: orderStatus,
});

test('isSalesOrder: hanya lunas & tidak dibatalkan', () => {
  assert.equal(isSalesOrder(order('2026-11-01T00:00:00Z', 1)), true);
  assert.equal(isSalesOrder(order('2026-11-01T00:00:00Z', 1, 'unpaid', 'menunggu_pembayaran')), false);
  assert.equal(isSalesOrder(order('2026-11-01T00:00:00Z', 1, 'paid', 'dibatalkan')), false);
  assert.equal(isSalesOrder(order('2026-11-01T00:00:00Z', 1, 'refunded', 'dibatalkan')), false);
});

test('lastNDateKeys: n hari berakhir di tanggal akhir, melewati batas bulan & tahun', () => {
  assert.deepEqual(lastNDateKeys('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(lastNDateKeys('2027-01-01', 2), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(lastNDateKeys('2028-03-01', 2), ['2028-02-29', '2028-03-01']);
});

test('aggregateDailySales: per tanggal WIB, non-penjualan & di luar rentang diabaikan, sen tanpa galat', () => {
  const keys = ['2026-10-31', '2026-11-01'];
  const rows = aggregateDailySales([
    order('2026-10-31T16:59:59Z', 0.1), // 31 Okt 23.59 WIB
    order('2026-10-31T17:00:00Z', 0.2), // 1 Nov 00.00 WIB
    order('2026-11-01T10:00:00Z', 0.1),
    order('2026-11-01T10:00:00Z', 50, 'unpaid', 'menunggu_pembayaran'),
    order('2026-11-01T10:00:00Z', 70, 'paid', 'dibatalkan'),
    order('2026-11-01T17:00:00Z', 90), // 2 Nov WIB — di luar rentang
  ], keys);
  assert.deepEqual(rows, [
    { date: '2026-10-31', revenue: 0.1, orders: 1 },
    { date: '2026-11-01', revenue: 0.3, orders: 2 },
  ]);
});

test('percentChange: dibulatkan, null bila pembanding nol', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(0, 100), -100);
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(2, 3), -33);
});

test('countOrdersByStatus & countNeedsProcessing: semua status, nol bila tidak ada', () => {
  const counts = countOrdersByStatus([{ status: 'dikonfirmasi', count: 2 }, { status: 'sedang_disiapkan', count: 3 }, { status: 'selesai', count: 1 }]);
  assert.deepEqual(counts, {
    menunggu_pembayaran: 0, dikonfirmasi: 2, sedang_disiapkan: 3, siap_diambil: 0, dalam_pengiriman: 0, selesai: 1, dibatalkan: 0,
  });
  assert.equal(countNeedsProcessing(counts), 5);
  assert.equal(countNeedsProcessing(countOrdersByStatus([])), 0);
});

test('isLowStock: stok ≤ minimum (termasuk sama), dibandingkan dalam sen', () => {
  assert.equal(isLowStock({ stock: 5, min_stock: 10 }), true);
  assert.equal(isLowStock({ stock: '10.00', min_stock: '10' }), true);
  assert.equal(isLowStock({ stock: 10.01, min_stock: 10 }), false);
  assert.equal(isLowStock({ stock: 0.3, min_stock: 0.1 + 0.2 }), true);
});
