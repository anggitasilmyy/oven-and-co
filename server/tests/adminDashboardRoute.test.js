// Regresi tingkat HTTP Step 6.4.6: GET /api/admin/dashboard (FR-27 · UC-26 · AD-02). Hanya Owner; "hari ini" WIB;
// omzet & grafik dari pesanan lunas tidak dibatalkan (8 hari, hari pertama hanya pembanding); pesanan hari ini semua
// status; donut & perlu diproses dari satu hitungan; rating tanpa ulasan tersembunyi; pesanan terbaru = baris AD-03;
// produk terlaris tanpa produk nonaktif; stok menipis = bahan baku stock ≤ min_stock; kontrak = client mock
// services/dashboardService.js. Prisma dipalsukan (filter dinilai whereMatch) — query MySQL dibuktikan di uji integrasi.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

// 2026-10-31 23.30 UTC = Minggu 1 Nov 2026 06.30 WIB → "hari ini" = 2026-11-01 (bukan 31 Okt)
const NOW = new Date('2026-10-31T23:30:00.000Z');
const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
};
const products = [
  { productId: 1n, name: 'Classic Butter Croissant', isActive: true, price: '28000.00', categoryId: 3, availabilityType: 'ready', leadTimeDays: 0 },
  { productId: 2n, name: 'Signature Cinnamon Roll', isActive: true, price: '32000.00', categoryId: 1, availabilityType: 'ready', leadTimeDays: 0 },
  { productId: 4n, name: 'Roti Lama', isActive: false, price: '10000.00', categoryId: 1, availabilityType: 'ready', leadTimeDays: 0 },
  { productId: 6n, name: 'Custom Celebration Cake', isActive: true, price: '450000.00', categoryId: 5, availabilityType: 'custom', leadTimeDays: 3 },
];
const productName = (id) => products.find((p) => p.productId === id).name;

let tables;
let failOn;

function seed() {
  let id = 0;
  const o = (orderNumber, createdAt, total, paymentStatus, orderStatus, items, methodCode = 'qris') => ({
    orderId: BigInt((id += 1)), orderNumber, createdAt: new Date(createdAt), total, paymentStatus, orderStatus,
    userId: 1n, user: { name: 'Rina Wulandari' }, fulfillmentType: 'pickup', readyDate: new Date('2026-11-01T00:00:00Z'),
    timeSlot: '09.00–11.00', paymentOption: methodCode === 'pay_at_store' ? 'pay_at_store' : 'online',
    payments: [{ methodCode, method: { name: methodCode === 'qris' ? 'QRIS' : 'Bayar di Toko' } }],
    items: items.map(([productId, quantity]) => ({ productId: BigInt(productId), quantity, product: { name: productName(BigInt(productId)) } })),
  });
  return {
    orders: [
      o('OVC-261101-001', '2026-10-31T17:30:00Z', '150000.00', 'paid', 'selesai', [[1, 3]]), // 1 Nov 00.30 WIB
      o('OVC-261031-009', '2026-10-31T16:59:00Z', '100000.00', 'paid', 'dikonfirmasi', [[2, 2], [4, 9]]), // 31 Okt 23.59 WIB
      o('OVC-261101-002', '2026-10-31T22:00:00Z', '50000.00', 'unpaid', 'menunggu_pembayaran', [[1, 1]]), // hari ini, belum lunas
      o('OVC-261101-003', '2026-10-31T23:00:00Z', '70000.00', 'refunded', 'dibatalkan', [[2, 5]]), // hari ini, batal
      o('OVC-261025-001', '2026-10-24T18:00:00Z', '40000.00', 'paid', 'selesai', [[2, 50]]), // 25 Okt WIB: hanya pembanding
      o('OVC-261024-001', '2026-10-24T16:00:00Z', '999999.00', 'paid', 'selesai', [[1, 99]]), // 24 Okt WIB: di luar rentang
      o('OVC-261028-001', '2026-10-28T03:00:00Z', '60000.25', 'paid', 'sedang_disiapkan', [[6, 1]]),
    ],
    reviews: [
      { rating: 5, isHidden: false, orderItem: { productId: 1n } },
      { rating: 4, isHidden: false, orderItem: { productId: 1n } },
      { rating: 4, isHidden: false, orderItem: { productId: 2n } },
      { rating: 1, isHidden: true, orderItem: { productId: 2n } },
    ],
    rawMaterials: [
      { materialId: 2n, name: 'Mentega', unit: 'kg', stock: '10.00', minStock: '10.00' },
      { materialId: 1n, name: 'Tepung Terigu', unit: 'kg', stock: '5.50', minStock: '10.00' },
      { materialId: 3n, name: 'Gula', unit: 'kg', stock: '20.50', minStock: '10.00' },
    ],
  };
}

const dbFailure = () => Object.assign(new Error("Can't reach database server"), { code: 'P1001' });
const pick = (row, select) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
const models = {};
models.order = {
  findMany: async (args) => {
    if (failOn) throw dbFailure();
    const rows = tables.orders.filter((row) => matchesWhere(row, args.where));
    if (args.select?.items) {
      // getSalesTotals (produk terlaris)
      return rows.map((row) => ({ items: row.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) }));
    }
    if (args.select) return rows.map((row) => pick(row, args.select));
    assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { orderId: 'desc' }]);
    return [...rows]
      .sort((a, b) => b.createdAt - a.createdAt || (b.orderId > a.orderId ? 1 : -1))
      .slice(0, args.take);
  },
  count: async ({ where }) => tables.orders.filter((row) => matchesWhere(row, where)).length,
  groupBy: async ({ by, where }) => {
    assert.deepEqual(by, ['orderStatus']);
    const counts = new Map();
    for (const row of tables.orders.filter((r) => matchesWhere(r, where))) counts.set(row.orderStatus, (counts.get(row.orderStatus) ?? 0) + 1);
    return [...counts].map(([orderStatus, count]) => ({ orderStatus, _count: { _all: count } }));
  },
};
models.product = {
  findMany: async ({ where, select }) => {
    const rows = products.filter((row) => matchesWhere(row, where));
    if (select) return rows.map((row) => pick(row, select));
    return rows.map((row) => ({ ...row, category: { name: 'Kategori' }, images: [{ imageUrl: `/images/${row.productId}.webp` }], dailyStocks: [] }));
  },
};
models.review = {
  aggregate: async ({ where }) => {
    const rows = tables.reviews.filter((row) => matchesWhere(row, where));
    return { _sum: { rating: rows.length ? rows.reduce((s, r) => s + r.rating, 0) : null }, _count: { _all: rows.length } };
  },
  findMany: async ({ where }) => tables.reviews.filter((row) => matchesWhere(row, where)),
};
models.rawMaterial = {
  findMany: async ({ orderBy }) => {
    assert.deepEqual(orderBy, { materialId: 'asc' });
    return [...tables.rawMaterials].sort((a, b) => (a.materialId < b.materialId ? -1 : 1));
  },
};

// Snapshot baca: semua query Dashboard WAJIB lewat klien transaksi `tx`. Model Prisma global dipasang sebagai penjaga
// yang gagal bila dipakai; `tx` mencatat setiap query dan memastikan tidak ada dua query berjalan bersamaan (berurutan).
let txCalls; // opsi tiap $transaction
let queryLog; // `${model}.${method}` lewat tx
let globalCalls; // query lewat Prisma global (harus kosong)
let inFlight = 0;
let overlapped = false;
const txClient = Object.fromEntries(Object.entries(models).map(([model, methods]) => [model, Object.fromEntries(
  Object.entries(methods).map(([name, fn]) => [name, async (...args) => {
    if (inFlight > 0) overlapped = true;
    inFlight += 1;
    queryLog.push(`${model}.${name}`);
    try {
      await new Promise((resolve) => setImmediate(resolve)); // beri kesempatan query lain menyusul bila tidak di-await
      return await fn(...args);
    } finally {
      inFlight -= 1;
    }
  }])
)]));
for (const [model, methods] of Object.entries(models)) {
  fakePrisma[model] = Object.fromEntries(Object.keys(methods).map((name) => [name, async () => {
    globalCalls.push(`${model}.${name}`);
    throw new Error(`query ${model}.${name} lewat Prisma global, bukan klien transaksi`);
  }]));
}
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
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/dashboard`;
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
const get = async (token = tokenFor('4')) => {
  const res = await fetch(baseUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('hanya Owner: tamu 401, token tidak valid SESSION_INVALID, pelanggan & Staf 403', async () => {
  assert.equal((await get(null)).status, 401);
  assert.equal((await get('token-palsu')).json.code, 'SESSION_INVALID');
  assert.equal((await get(tokenFor('1'))).status, 403);
  assert.equal((await get(tokenFor('3'))).status, 403);
  assert.equal((await get(tokenFor('4'))).status, 200);
});

test('snapshot baca: satu transaksi REPEATABLE READ, semua query lewat tx, berurutan, tanpa Prisma global', async () => {
  assert.equal((await get()).status, 200);
  assert.equal(txCalls.length, 1);
  assert.equal(txCalls[0].isolationLevel, 'RepeatableRead');
  assert.ok(txCalls[0].timeout > 0 && txCalls[0].maxWait > 0);
  assert.deepEqual(globalCalls, []);
  assert.equal(overlapped, false, 'query di dalam transaksi tidak boleh berjalan bersamaan');
  // Semua bagian, termasuk produk terlaris (penjualan, produk aktif, produk + relasi, rating), lewat tx
  assert.deepEqual(queryLog, [
    'order.findMany', 'order.count', 'order.groupBy', 'review.aggregate', 'order.findMany',
    'order.findMany', 'product.findMany', 'product.findMany', 'review.findMany', 'rawMaterial.findMany',
  ]);
});

test('peran ditolak sebelum transaksi dibuka (401/403 tanpa query Dashboard)', async () => {
  await get(null);
  await get(tokenFor('3'));
  assert.deepEqual([txCalls, queryLog], [[], []]);
});

test('kontrak respons sama dengan mock; KPI hari ini menurut WIB', async () => {
  const { status, json } = await get();
  assert.equal(status, 200);
  const data = json.data;
  assert.deepEqual(Object.keys(data).sort(), ['bestSellers', 'kpi', 'lowStock', 'recentOrders', 'salesChart', 'statusCounts', 'todayKey', 'totalOrders']);
  assert.equal(data.todayKey, '2026-11-01');
  assert.deepEqual(data.kpi, {
    revenueToday: 150000, // hanya pesanan lunas & tidak dibatalkan yang dibuat 1 Nov WIB
    revenueChange: 50, // vs 31 Okt (100.000; pesanan 23.59 WIB tetap hari kemarin)
    ordersToday: 3, // semua status, termasuk belum lunas & dibatalkan (sama dengan mock)
    needsProcessing: 2, // dikonfirmasi + sedang disiapkan
    rating: { average: 4.3, count: 3 }, // (5+4+4)/3, ulasan tersembunyi tidak dihitung
  });
});

test('grafik 7 hari (26 Okt – 1 Nov): hari ke-8 hanya pembanding, nilai desimal tepat', async () => {
  const { salesChart } = (await get()).json.data;
  assert.deepEqual(salesChart.map((d) => d.date), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(salesChart.filter((d) => d.orders > 0), [
    { date: '2026-10-28', revenue: 60000.25, orders: 1 },
    { date: '2026-10-31', revenue: 100000, orders: 1 },
    { date: '2026-11-01', revenue: 150000, orders: 1 },
  ]);
});

test('donut per status: semua status dari konstanta; total = jumlah semua pesanan', async () => {
  const { statusCounts, totalOrders } = (await get()).json.data;
  assert.deepEqual(statusCounts, {
    menunggu_pembayaran: 1, dikonfirmasi: 1, sedang_disiapkan: 1, siap_diambil: 0, dalam_pengiriman: 0, selesai: 3, dibatalkan: 1,
  });
  assert.equal(totalOrders, 7);
});

test('pesanan terbaru: 5 terbaru, bentuk baris AD-03', async () => {
  const { recentOrders } = (await get()).json.data;
  assert.deepEqual(recentOrders.map((r) => r.order_number), ['OVC-261101-003', 'OVC-261101-002', 'OVC-261101-001', 'OVC-261031-009', 'OVC-261028-001']);
  assert.deepEqual(recentOrders[3], {
    order_id: '2', order_number: 'OVC-261031-009', created_at: '2026-10-31T16:59:00.000Z', customer_name: 'Rina Wulandari',
    fulfillment_type: 'pickup', ready_date: '2026-11-01', time_slot: '09.00–11.00', total: 100000, payment_option: 'online',
    payment_status: 'paid', method_code: 'qris', method_name: 'QRIS', order_status: 'dikonfirmasi', item_count: 11,
    items_summary: 'Signature Cinnamon Roll ×2, +1 lainnya',
  });
});

test('produk terlaris 7 hari: produk nonaktif dikecualikan (keputusan 6.4.6), batal/belum lunas tidak dihitung', async () => {
  const { bestSellers } = (await get()).json.data;
  // Roti Lama (nonaktif) 9 pcs tidak tampil; 25 Okt (di luar 7 hari) & pesanan batal/belum lunas tidak dihitung
  assert.deepEqual(bestSellers.map((p) => [p.product_id, p.quantity_sold]), [['1', 3], ['2', 2], ['6', 1]]);
  assert.deepEqual(Object.keys(bestSellers[0]).sort(), [
    'availability_type', 'category_id', 'category_name', 'image_url', 'is_active', 'lead_time_days', 'name', 'price', 'product_id', 'quantity_sold', 'rating', 'remaining_today',
  ]);
});

test('stok menipis: bahan baku stock ≤ min_stock (bukan daily_stocks), urut id, angka', async () => {
  const { lowStock } = (await get()).json.data;
  assert.deepEqual(lowStock, [
    { material_id: '1', name: 'Tepung Terigu', unit: 'kg', stock: 5.5, min_stock: 10 },
    { material_id: '2', name: 'Mentega', unit: 'kg', stock: 10, min_stock: 10 },
  ]);
});

test('basis data kosong: angka nol, perubahan & rating null, daftar kosong', async () => {
  tables = { orders: [], reviews: [], rawMaterials: [] };
  const data = (await get()).json.data;
  assert.deepEqual(data.kpi, { revenueToday: 0, revenueChange: null, ordersToday: 0, needsProcessing: 0, rating: { average: null, count: 0 } });
  assert.equal(data.salesChart.length, 7);
  assert.ok(data.salesChart.every((d) => d.revenue === 0 && d.orders === 0));
  assert.equal(data.totalOrders, 0);
  assert.deepEqual([data.recentOrders, data.bestSellers, data.lowStock], [[], [], []]);
});

test('omzet kemarin nol → revenueChange null (bukan Infinity)', async () => {
  tables.orders = tables.orders.filter((o) => o.orderNumber !== 'OVC-261031-009');
  assert.equal((await get()).json.data.kpi.revenueChange, null);
});

test('gagal basis data → 500 dengan pesan umum (detail tidak bocor)', async (t) => {
  t.mock.method(console, 'error', () => {});
  failOn = true;
  const { status, json } = await get();
  assert.equal(status, 500);
  assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});
