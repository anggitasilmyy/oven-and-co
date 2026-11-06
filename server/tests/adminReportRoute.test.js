// Regresi tingkat HTTP Step 6.4.7: GET /api/admin/reports/sales (FR-33 · UC-27 · BR-019 · AD-08). Hanya Owner; periode
// harian/mingguan/bulanan/rentang menurut WIB; validasi query & rentang (400, pesan mock) sebelum transaksi dibuka;
// satu snapshot baca REPEATABLE READ dengan semua query lewat `tx` berurutan; KPI, per hari, terlaris (termasuk produk
// nonaktif), metode (pembayaran terbaru / cadangan payment_option), transaksi; kontrak = client mock reportViews.js.
// Prisma dipalsukan (filter dinilai whereMatch) — query MySQL dibuktikan di uji integrasi MySQL 8.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

// 2026-10-31 23.30 UTC = Minggu 1 Nov 2026 06.30 WIB → "hari ini" = 2026-11-01
const NOW = new Date('2026-10-31T23:30:00.000Z');
const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
};
const products = [
  { productId: 1n, name: 'Classic Butter Croissant' },
  { productId: 2n, name: 'Signature Cinnamon Roll' },
  { productId: 4n, name: 'Roti Lama' }, // nonaktif — tetap tampil di laporan (penjualan historis)
  { productId: 6n, name: 'Custom Celebration Cake' },
];
const methods = [
  { methodCode: 'qris', name: 'QRIS', methodGroup: 'qris' },
  { methodCode: 'gopay', name: 'GoPay', methodGroup: 'ewallet' },
  { methodCode: 'pay_at_store', name: 'Bayar di Toko', methodGroup: 'store' },
];

let tables;
let failOn;

function seed() {
  const o = (orderId, createdAt, total, paymentStatus, orderStatus, items, payments, extra = {}) => ({
    orderId: BigInt(orderId), orderNumber: `OVC-T-${String(orderId).padStart(3, '0')}`, createdAt: new Date(createdAt), total, paymentStatus, orderStatus,
    fulfillmentType: 'pickup', paymentOption: 'online', user: { name: `Pelanggan ${orderId}` },
    payments: payments.map(([paymentId, methodCode]) => ({ paymentId: BigInt(paymentId), methodCode })),
    items: items.map(([productId, quantity]) => ({ productId: BigInt(productId), quantity })),
    ...extra,
  });
  return {
    storeSetting: { settingId: 1, storeName: 'Oven & Co.' },
    orders: [
      o(1, '2026-10-31T17:30:00Z', '150000.50', 'paid', 'selesai', [[1, 3]], [[1, 'qris']]), // 1 Nov 00.30 WIB
      o(2, '2026-10-31T16:59:00Z', '100000.00', 'paid', 'dikonfirmasi', [[2, 2], [4, 1]], [[10, 'qris'], [20, 'gopay']], { fulfillmentType: 'delivery' }), // 31 Okt 23.59 WIB; metode terbaru gopay
      o(3, '2026-10-31T22:00:00Z', '50000.00', 'unpaid', 'menunggu_pembayaran', [[1, 1]], [[3, 'qris']]),
      o(4, '2026-10-31T23:00:00Z', '70000.00', 'refunded', 'dibatalkan', [[2, 5]], [[4, 'qris']]),
      o(5, '2026-10-25T17:00:00Z', '40000.00', 'paid', 'selesai', [[2, 1]], [[5, 'pay_at_store']], { paymentOption: 'pay_at_store' }), // 26 Okt 00.00 WIB
      o(6, '2026-10-25T16:59:59Z', '999999.00', 'paid', 'selesai', [[1, 9]], [[6, 'qris']]), // 25 Okt 23.59 WIB
      o(7, '2026-10-28T03:00:00Z', '60000.25', 'paid', 'sedang_disiapkan', [[6, 1]], [], { paymentOption: 'pay_at_store' }), // tanpa baris payments
      o(8, '2026-10-28T03:00:00Z', '60000.25', 'paid', 'siap_diambil', [[1, 1]], [[8, 'qris']]), // waktu sama dengan #7
    ],
  };
}

const dbFailure = () => Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

const models = {
  storeSetting: {
    findFirst: async ({ orderBy, select }) => {
      assert.deepEqual([orderBy, select], [{ settingId: 'asc' }, { storeName: true }]);
      return tables.storeSetting;
    },
  },
  paymentMethod: { findMany: async () => methods },
  order: {
    findMany: async (args) => {
      if (failOn) throw dbFailure();
      assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { orderId: 'desc' }]);
      assert.deepEqual(args.select.payments, { orderBy: { paymentId: 'desc' }, take: 1, select: { methodCode: true } });
      return tables.orders
        .filter((row) => matchesWhere(row, args.where))
        .sort((a, b) => b.createdAt - a.createdAt || (b.orderId > a.orderId ? 1 : -1))
        .map((row) => ({ ...row, payments: [...row.payments].sort((a, b) => (b.paymentId > a.paymentId ? 1 : -1)).slice(0, 1).map((p) => ({ methodCode: p.methodCode })) }));
    },
  },
  product: { findMany: async ({ where }) => products.filter((row) => matchesWhere(row, where)) },
};

// Snapshot baca: penjaga Prisma global + klien tx yang mencatat query dan mendeteksi query tumpang tindih
let txCalls;
let queryLog;
let globalCalls;
let inFlight = 0;
let overlapped = false;
const txClient = Object.fromEntries(Object.entries(models).map(([model, fns]) => [model, Object.fromEntries(
  Object.entries(fns).map(([name, fn]) => [name, async (...args) => {
    if (inFlight > 0) overlapped = true;
    inFlight += 1;
    queryLog.push(`${model}.${name}`);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return await fn(...args);
    } finally {
      inFlight -= 1;
    }
  }])
)]));
for (const [model, fns] of Object.entries(models)) {
  fakePrisma[model] = Object.fromEntries(Object.keys(fns).map((name) => [name, async () => {
    globalCalls.push(`${model}.${name}`);
    throw new Error(`query ${model}.${name} lewat Prisma global, bukan klien transaksi`);
  }]));
}
fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.$transaction = async (callback, options) => {
  txCalls.push(options);
  return callback(txClient);
};

let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/reports/sales`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  tables = seed();
  failOn = false;
  txCalls = [];
  queryLog = [];
  globalCalls = [];
  overlapped = false;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const get = async (query = '?period=mingguan', token = tokenFor('4')) => {
  const res = await fetch(`${baseUrl}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('hanya Owner: tamu 401, token tidak valid SESSION_INVALID, pelanggan & Staf 403; tanpa transaksi dibuka', async () => {
  assert.equal((await get(undefined, null)).status, 401);
  assert.equal((await get(undefined, 'token-palsu')).json.code, 'SESSION_INVALID');
  assert.equal((await get(undefined, tokenFor('1'))).status, 403);
  assert.equal((await get(undefined, tokenFor('3'))).status, 403);
  assert.deepEqual(txCalls, []);
  assert.equal((await get(undefined, tokenFor('4'))).status, 200);
});

test('snapshot baca: satu transaksi REPEATABLE READ, semua query lewat tx, berurutan, tanpa Prisma global', async () => {
  assert.equal((await get()).status, 200);
  assert.equal(txCalls.length, 1);
  assert.equal(txCalls[0].isolationLevel, 'RepeatableRead');
  assert.deepEqual(globalCalls, []);
  assert.equal(overlapped, false);
  assert.deepEqual(queryLog, ['storeSetting.findFirst', 'paymentMethod.findMany', 'order.findMany', 'product.findMany']);
});

test('mingguan (default): kontrak & angka sama dengan mock, batas hari WIB', async () => {
  const { status, json } = await get('');
  assert.equal(status, 200);
  const r = json.data;
  assert.deepEqual(Object.keys(r).sort(), ['bestSellers', 'daily', 'from', 'kpi', 'paymentMethods', 'period', 'store_name', 'to', 'todayKey', 'transactions']);
  assert.deepEqual([r.todayKey, r.store_name, r.period, r.from, r.to], ['2026-11-01', 'Oven & Co.', 'mingguan', '2026-10-26', '2026-11-01']);
  // #1, #2, #5 (26 Okt 00.00 WIB), #7, #8; bukan #6 (25 Okt 23.59 WIB), #3 belum lunas, #4 batal
  assert.deepEqual(r.kpi, { revenue: 410001, transactions: 5, average: 82000, itemsSold: 9 });
  assert.deepEqual(r.daily.filter((d) => d.orders), [
    { date: '2026-10-26', revenue: 40000, orders: 1 },
    { date: '2026-10-28', revenue: 120000.5, orders: 2 },
    { date: '2026-10-31', revenue: 100000, orders: 1 },
    { date: '2026-11-01', revenue: 150000.5, orders: 1 },
  ]);
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.bestSellers, [
    { product_id: '1', quantity: 4, name: 'Classic Butter Croissant' },
    { product_id: '2', quantity: 3, name: 'Signature Cinnamon Roll' },
    { product_id: '4', quantity: 1, name: 'Roti Lama' },
    { product_id: '6', quantity: 1, name: 'Custom Celebration Cake' },
  ]);
  assert.deepEqual(r.paymentMethods, [
    { method_code: 'qris', name: 'QRIS', method_group: 'qris', transactions: 2, revenue: 210000.75 },
    { method_code: 'pay_at_store', name: 'Bayar di Toko', method_group: 'store', transactions: 2, revenue: 100000.25 },
    { method_code: 'gopay', name: 'GoPay', method_group: 'ewallet', transactions: 1, revenue: 100000 },
  ]);
  assert.deepEqual(r.transactions.map((t) => t.order_number), ['OVC-T-001', 'OVC-T-002', 'OVC-T-008', 'OVC-T-007', 'OVC-T-005']);
  assert.deepEqual(r.transactions[1], {
    order_id: '2', order_number: 'OVC-T-002', created_at: '2026-10-31T16:59:00.000Z', customer_name: 'Pelanggan 2',
    fulfillment_type: 'delivery', method_name: 'GoPay', item_count: 3, total: 100000,
  });
});

test('harian, bulanan (1 Nov = hari pertama bulan), rentang termasuk batas 23.59 WIB', async () => {
  const harian = (await get('?period=harian')).json.data;
  assert.deepEqual([harian.from, harian.to, harian.kpi.transactions, harian.transactions[0].order_number], ['2026-11-01', '2026-11-01', 1, 'OVC-T-001']);
  const bulanan = (await get('?period=bulanan')).json.data;
  assert.deepEqual([bulanan.from, bulanan.to, bulanan.kpi.revenue], ['2026-11-01', '2026-11-01', 150000.5]);
  const rentang = (await get('?period=rentang&from=2026-10-25&to=2026-10-25')).json.data;
  assert.deepEqual([rentang.period, rentang.from, rentang.to, rentang.kpi.revenue, rentang.transactions.map((t) => t.order_number)], ['rentang', '2026-10-25', '2026-10-25', 999999, ['OVC-T-006']]);
  // from/to diabaikan untuk periode selain rentang (sama dengan mock)
  assert.equal((await get('?period=harian&from=2026-01-01&to=2026-01-02')).json.data.from, '2026-11-01');
});

test('query & rentang tidak valid → 400 dengan pesan mock, transaksi tidak dibuka', async () => {
  const cases = [
    ['?period=tahunan', 'Periode laporan tidak valid.'],
    ['?period=harian&period=bulanan', 'Periode laporan tidak valid.'],
    ['?period=rentang', 'Pilih tanggal mulai dan tanggal selesai'],
    ['?period=rentang&from=2026-02-30&to=2026-03-01', 'Pilih tanggal mulai dan tanggal selesai'],
    ['?period=rentang&from=2026-10-01T00:00&to=2026-10-02', 'Pilih tanggal mulai dan tanggal selesai'],
    ['?period=rentang&from=2026-10-01&from=2026-10-02&to=2026-10-03', 'Pilih tanggal mulai dan tanggal selesai'],
    ['?period=rentang&from=2026-10-10&to=2026-10-09', 'Tanggal mulai harus sebelum atau sama dengan tanggal selesai'],
    ['?period=rentang&from=2026-10-01&to=2026-11-02', 'Tanggal selesai tidak boleh melewati hari ini'],
    ['?period=rentang&from=2026-08-01&to=2026-11-01', 'Rentang maksimal 92 hari'],
  ];
  for (const [query, message] of cases) {
    const { status, json } = await get(query);
    assert.deepEqual([status, json.message], [400, message], query);
  }
  assert.deepEqual(txCalls, []);
  assert.equal((await get('?period=rentang&from=2026-08-02&to=2026-11-01')).status, 200); // tepat 92 hari
});

test('data kosong: angka nol, grafik per hari tetap lengkap, daftar kosong, nama produk tidak di-query', async () => {
  tables.orders = [];
  const r = (await get('?period=rentang&from=2026-10-01&to=2026-10-31')).json.data;
  assert.deepEqual(r.kpi, { revenue: 0, transactions: 0, average: 0, itemsSold: 0 });
  assert.equal(r.daily.length, 31);
  assert.ok(r.daily.every((d) => d.revenue === 0 && d.orders === 0));
  assert.deepEqual([r.bestSellers, r.paymentMethods, r.transactions], [[], [], []]);
  assert.ok(!queryLog.includes('product.findMany'));
});

test('invarian antarbagian: omzet = Σ per hari = Σ metode = Σ transaksi; jumlah transaksi & item cocok', async () => {
  const r = (await get('?period=rentang&from=2026-10-01&to=2026-11-01')).json.data;
  const cents = (list, key) => list.reduce((s, x) => s + Math.round(x[key] * 100), 0);
  const revenue = Math.round(r.kpi.revenue * 100);
  assert.deepEqual([cents(r.daily, 'revenue'), cents(r.paymentMethods, 'revenue'), cents(r.transactions, 'total')], [revenue, revenue, revenue]);
  assert.equal(r.kpi.transactions, r.transactions.length);
  assert.equal(r.kpi.transactions, r.daily.reduce((s, d) => s + d.orders, 0));
  assert.equal(r.kpi.transactions, r.paymentMethods.reduce((s, m) => s + m.transactions, 0));
  assert.equal(r.kpi.itemsSold, r.transactions.reduce((s, t) => s + t.item_count, 0));
  assert.equal(r.kpi.itemsSold, r.bestSellers.reduce((s, b) => s + b.quantity, 0));
});

test('gagal basis data → 500 dengan pesan umum (detail tidak bocor)', async (t) => {
  t.mock.method(console, 'error', () => {});
  failOn = true;
  const { status, json } = await get();
  assert.equal(status, 500);
  assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});
