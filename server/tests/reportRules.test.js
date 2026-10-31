// Step 6.4.7 · FR-33 · AD-08 — aturan murni laporan penjualan (port client utils/rules/report.js) di
// services/reportRules.service.js: rentang periode & pesan error, agregasi KPI/per hari/terlaris/metode/transaksi.

const test = require('node:test');
const assert = require('node:assert/strict');
const { daysBetweenInclusive, dateKeysBetween, resolveReportRange, buildSalesReport } = require('../src/services/reportRules.service');

const TODAY = '2026-11-01';

test('daysBetweenInclusive & dateKeysBetween: inklusif, lintas bulan & tahun kabisat', () => {
  assert.equal(daysBetweenInclusive('2026-11-01', '2026-11-01'), 1);
  assert.equal(daysBetweenInclusive('2028-02-28', '2028-03-01'), 3);
  assert.deepEqual(dateKeysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(dateKeysBetween('2026-11-02', '2026-11-01'), []);
});

test('resolveReportRange: harian, mingguan (7 hari), bulanan berjalan; periode lain = mingguan', () => {
  assert.deepEqual(resolveReportRange({ period: 'harian' }, TODAY), { from: TODAY, to: TODAY, error: null });
  assert.deepEqual(resolveReportRange({ period: 'mingguan' }, TODAY), { from: '2026-10-26', to: TODAY, error: null });
  assert.deepEqual(resolveReportRange({ period: 'bulanan' }, TODAY), { from: '2026-11-01', to: TODAY, error: null });
  assert.deepEqual(resolveReportRange({ period: 'bulanan' }, '2026-10-31'), { from: '2026-10-01', to: '2026-10-31', error: null });
  assert.deepEqual(resolveReportRange({ period: undefined }, '2026-03-03'), { from: '2026-02-25', to: '2026-03-03', error: null });
  // from/to diabaikan selain rentang
  assert.deepEqual(resolveReportRange({ period: 'harian', from: '2026-01-01', to: '2026-01-02' }, TODAY).from, TODAY);
});

test('resolveReportRange rentang: pesan error sama dengan mock; batas 92 hari & hari ini inklusif', () => {
  const err = (from, to) => resolveReportRange({ period: 'rentang', from, to }, TODAY).error;
  for (const [from, to] of [[undefined, TODAY], [TODAY, undefined], ['', ''], ['2026-02-30', TODAY], ['2026-1-01', TODAY], ['0999-01-01', TODAY], ['abc', TODAY]]) {
    assert.equal(err(from, to), 'Pilih tanggal mulai dan tanggal selesai', `${from}..${to}`);
  }
  assert.equal(err('2026-10-02', '2026-10-01'), 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai');
  assert.equal(err('2026-10-01', '2026-11-02'), 'Tanggal selesai tidak boleh melewati hari ini');
  assert.equal(err('2026-08-01', TODAY), 'Rentang maksimal 92 hari'); // 93 hari
  assert.deepEqual(resolveReportRange({ period: 'rentang', from: '2026-08-02', to: TODAY }, TODAY), { from: '2026-08-02', to: TODAY, error: null }); // tepat 92
  assert.equal(err(TODAY, TODAY), null);
});

const methods = new Map([
  ['qris', { name: 'QRIS', method_group: 'qris' }],
  ['gopay', { name: 'GoPay', method_group: 'ewallet' }],
  ['pay_at_store', { name: 'Bayar di Toko', method_group: 'store' }],
]);
const productNames = new Map([['1', 'Croissant'], ['2', 'Cinnamon Roll'], ['9', 'Sourdough'], ['10', 'Milk Bun']]);
const order = (id, createdAt, total, extra = {}) => ({
  order_id: String(id), order_number: `OVC-${id}`, created_at: new Date(createdAt), total, payment_status: 'paid', order_status: 'selesai',
  fulfillment_type: 'pickup', payment_option: 'online', customer_name: 'Rina', method_code: 'qris', items: [{ product_id: '1', quantity: 1 }], ...extra,
});

test('buildSalesReport: KPI dalam sen, non-penjualan & di luar rentang diabaikan, batas hari WIB', () => {
  const report = buildSalesReport({
    orders: [
      order(1, '2026-10-31T17:00:00Z', 0.1), // 1 Nov 00.00 WIB
      order(2, '2026-10-31T16:59:59Z', 50), // 31 Okt 23.59 WIB → di luar
      order(3, '2026-11-01T10:00:00Z', 0.2, { items: [{ product_id: '2', quantity: 4 }] }),
      order(4, '2026-11-01T10:00:00Z', 70, { payment_status: 'unpaid', order_status: 'menunggu_pembayaran' }),
      order(5, '2026-11-01T10:00:00Z', 80, { payment_status: 'refunded', order_status: 'dibatalkan' }),
    ],
    methods, productNames,
  }, { from: TODAY, to: TODAY, bestSellerLimit: 5 });
  assert.deepEqual(report.kpi, { revenue: 0.3, transactions: 2, average: 0, itemsSold: 5 });
  assert.deepEqual(report.daily, [{ date: TODAY, revenue: 0.3, orders: 2 }]);
  assert.deepEqual(report.transactions.map((t) => t.order_id), ['3', '1']);
});

test('buildSalesReport: metode = pembayaran terbaru, cadangan payment_option, urut omzet lalu nama', () => {
  const report = buildSalesReport({
    orders: [
      order(1, '2026-11-01T01:00:00Z', 100, { method_code: 'gopay' }),
      order(2, '2026-11-01T02:00:00Z', 100, { method_code: null, payment_option: 'pay_at_store' }), // tanpa baris payments
      order(3, '2026-11-01T03:00:00Z', 150, { method_code: 'qris' }),
      order(4, '2026-11-01T04:00:00Z', 5, { method_code: 'va_lama' }), // metode tidak dikenal
    ],
    methods, productNames,
  }, { from: TODAY, to: TODAY, bestSellerLimit: 5 });
  assert.deepEqual(report.paymentMethods, [
    { method_code: 'qris', name: 'QRIS', method_group: 'qris', transactions: 1, revenue: 150 },
    { method_code: 'pay_at_store', name: 'Bayar di Toko', method_group: 'store', transactions: 1, revenue: 100 },
    { method_code: 'gopay', name: 'GoPay', method_group: 'ewallet', transactions: 1, revenue: 100 },
    { method_code: 'va_lama', name: 'va_lama', method_group: null, transactions: 1, revenue: 5 },
  ].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)));
  assert.deepEqual(report.transactions.map((t) => [t.order_id, t.method_name]), [['4', 'va_lama'], ['3', 'QRIS'], ['2', 'Bayar di Toko'], ['1', 'GoPay']]);
  assert.equal(report.kpi.average, 89); // 355 / 4 = 88,75 → dibulatkan
});

test('buildSalesReport: terlaris urut jumlah lalu id numerik, batas, nama cadangan; transaksi seri waktu → id terbesar dulu', () => {
  const at = '2026-11-01T05:00:00Z';
  const report = buildSalesReport({
    orders: [
      order(9, at, 10, { items: [{ product_id: '10', quantity: 2 }, { product_id: '9', quantity: 2 }] }),
      order(10, at, 10, { items: [{ product_id: '1', quantity: 1 }, { product_id: '77', quantity: 2 }] }),
      order(11, '2026-11-01T04:00:00Z', 10, { items: [{ product_id: '2', quantity: 5 }] }),
    ],
    methods, productNames,
  }, { from: TODAY, to: TODAY, bestSellerLimit: 3 });
  assert.deepEqual(report.bestSellers, [
    { product_id: '2', quantity: 5, name: 'Cinnamon Roll' },
    { product_id: '9', quantity: 2, name: 'Sourdough' }, // 9 sebelum 10 (numerik, bukan teks)
    { product_id: '10', quantity: 2, name: 'Milk Bun' },
  ]);
  assert.equal(buildSalesReport({ orders: [order(1, at, 1, { items: [{ product_id: '77', quantity: 1 }] })], methods, productNames }, { from: TODAY, to: TODAY, bestSellerLimit: 5 }).bestSellers[0].name, 'Produk #77');
  assert.deepEqual(report.transactions.map((t) => t.order_id), ['10', '9', '11']);
  assert.deepEqual(Object.keys(report.transactions[0]).sort(), ['created_at', 'customer_name', 'fulfillment_type', 'item_count', 'method_name', 'order_id', 'order_number', 'total']);
  assert.equal(report.transactions[0].created_at, '2026-11-01T05:00:00.000Z');
});

test('buildSalesReport: invarian antarbagian & data kosong', () => {
  const orders = Array.from({ length: 40 }, (_, i) => order(i + 1, `2026-10-${String(26 + (i % 6)).padStart(2, '0')}T0${i % 9}:00:00Z`, 1000.01 * ((i % 7) + 1), {
    method_code: ['qris', 'gopay', 'pay_at_store'][i % 3], items: [{ product_id: String((i % 4) + 1), quantity: (i % 3) + 1 }],
  }));
  const r = buildSalesReport({ orders, methods, productNames }, { from: '2026-10-26', to: TODAY, bestSellerLimit: 5 });
  const cents = (list, key) => list.reduce((s, x) => s + Math.round(x[key] * 100), 0);
  assert.equal(Math.round(r.kpi.revenue * 100), cents(r.daily, 'revenue'));
  assert.equal(Math.round(r.kpi.revenue * 100), cents(r.paymentMethods, 'revenue'));
  assert.equal(Math.round(r.kpi.revenue * 100), cents(r.transactions, 'total'));
  assert.equal(r.kpi.transactions, r.transactions.length);
  assert.equal(r.kpi.transactions, r.daily.reduce((s, d) => s + d.orders, 0));
  assert.equal(r.kpi.transactions, r.paymentMethods.reduce((s, m) => s + m.transactions, 0));
  assert.equal(r.kpi.itemsSold, r.transactions.reduce((s, t) => s + t.item_count, 0));
  assert.equal(r.kpi.itemsSold, r.bestSellers.reduce((s, b) => s + b.quantity, 0)); // ≤ 5 produk → semua tampil

  const empty = buildSalesReport({ orders: [], methods, productNames }, { from: '2026-10-26', to: TODAY, bestSellerLimit: 5 });
  assert.deepEqual(empty.kpi, { revenue: 0, transactions: 0, average: 0, itemsSold: 0 });
  assert.equal(empty.daily.length, 7);
  assert.deepEqual([empty.bestSellers, empty.paymentMethods, empty.transactions], [[], [], []]);
});
