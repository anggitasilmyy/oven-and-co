// Regresi tingkat HTTP Step 6.4.3: GET /api/admin/calendar (FR-29 · UC-22 · BR-03 · AD-05). Auth & peran, validasi
// bulan/tanggal, default hari ini (WIB), tanggal di luar bulan, filter status produksi & tipe produk (dinilai lewat
// whereMatch, bukan bentuk query), rentang grid, pill per tanggal, daftar per produk/desain, dan kontrak respons
// client mock/productionViews.js. Prisma dipalsukan — query MySQL dibuktikan terpisah (integrasi MySQL 8).

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
const products = {
  1: { name: 'Classic Butter Croissant', availabilityType: 'ready' },
  3: { name: 'Premium Birthday Cake', availabilityType: 'preorder' },
  5: { name: 'Sourdough', availabilityType: 'preorder' },
  6: { name: 'Custom Celebration Cake', availabilityType: 'custom' },
};
const designs = {
  60: { writingText: 'Happy Birthday', options: [{ optionId: 1, name: 'Diameter 20 cm' }, { optionId: 5, name: 'Bulat' }, { optionId: 9, name: 'Cokelat' }] },
  61: { writingText: null, options: [{ optionId: 2, name: 'Diameter 24 cm' }] },
};
const day = (key) => new Date(`${key}T00:00:00.000Z`);
const order = (orderNumber, orderStatus, readyKey, extra = {}) => ({
  orderNumber, orderStatus, readyDate: day(readyKey), fulfillmentType: 'pickup', timeSlot: '09.00–11.00', ...extra,
});

let items;
let lastArgs;
let failOn;

function seedItems() {
  const a = order('OVC-261028-001', 'dikonfirmasi', '2026-11-03');
  const b = order('OVC-261028-002', 'selesai', '2026-11-03', { fulfillmentType: 'delivery', timeSlot: '13.00–15.00' });
  const c = order('OVC-261028-003', 'menunggu_pembayaran', '2026-11-03');
  const d = order('OVC-261028-004', 'dibatalkan', '2026-11-03');
  const e = order('OVC-261028-005', 'sedang_disiapkan', '2026-11-01');
  const f = order('OVC-261028-006', 'siap_diambil', '2026-10-26'); // awal grid November (di luar bulan)
  const g = order('OVC-261028-007', 'dalam_pengiriman', '2026-12-07'); // setelah grid November
  const h = order('OVC-261028-008', 'dikonfirmasi', '2026-12-06'); // akhir grid November
  let id = 0;
  const item = (o, productId, quantity, designId = null) => ({ orderItemId: BigInt((id += 1)), order: o, productId: BigInt(productId), designId: designId == null ? null : BigInt(designId), quantity });
  return [
    item(a, 3, 2), item(a, 6, 1, 60), item(a, 3, 1), item(a, 1, 5),
    item(b, 3, 4), item(b, 6, 1, 61), item(c, 3, 9), item(d, 5, 9),
    item(e, 5, 3), item(f, 5, 1), item(g, 5, 1), item(h, 6, 1, 60),
  ];
}

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.orderItem = {
  findMany: async (args) => {
    if (failOn) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    lastArgs = args;
    const rows = items.map((i) => ({ ...i, product: products[String(i.productId)] }));
    return rows
      .filter((row) => matchesWhere(row, args.where))
      .sort((x, y) => (x.orderItemId < y.orderItemId ? -1 : 1))
      .map((row) => ({
        productId: row.productId,
        designId: row.designId,
        quantity: row.quantity,
        order: row.order,
        product: row.product,
        design: row.designId == null ? null : {
          writingText: designs[String(row.designId)].writingText,
          options: designs[String(row.designId)].options.map((o) => ({ option: { name: o.name } })),
        },
      }));
  },
};

let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/calendar`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  items = seedItems();
  lastArgs = null;
  failOn = false;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const get = async (query = '', token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('tamu 401, token tidak valid SESSION_INVALID, pelanggan 403; Staf & Owner 200', async () => {
  assert.equal((await get('', null)).status, 401);
  assert.equal((await get('', 'token-palsu')).json.code, 'SESSION_INVALID');
  assert.equal((await get('', tokenFor('1'))).status, 403);
  assert.equal((await get('', tokenFor('3'))).status, 200);
  assert.equal((await get('', tokenFor('4'))).status, 200);
});

test('tanpa parameter: bulan & tanggal hari ini menurut WIB; kontrak respons sama dengan mock', async () => {
  const { status, json } = await get();
  assert.equal(status, 200);
  const data = json.data;
  assert.deepEqual(Object.keys(data).sort(), ['counts', 'month_key', 'selected', 'today_key', 'weeks']);
  assert.deepEqual([data.month_key, data.today_key, data.selected.date], ['2026-11', '2026-11-01', '2026-11-01']);
  assert.equal(data.weeks.length, 6);
  assert.deepEqual(data.weeks[0][0], { date: '2026-10-26', inMonth: false });
  assert.deepEqual(data.weeks[5][6], { date: '2026-12-06', inMonth: false });

  // Query dibatasi grid yang tampil dan status produksi; tipe produk pre-order & custom
  assert.deepEqual(lastArgs.where.order.is.readyDate, { gte: day('2026-10-26'), lte: day('2026-12-06') });
  assert.deepEqual(lastArgs.where.order.is.orderStatus.in, ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai']);
  assert.deepEqual(lastArgs.orderBy, { orderItemId: 'asc' });

  // Pill = jumlah PESANAN per tipe; menunggu pembayaran, dibatalkan, ready, dan di luar grid tidak dihitung
  assert.deepEqual(data.counts, {
    '2026-10-26': { preorder: 1, custom: 0 },
    '2026-11-01': { preorder: 1, custom: 0 },
    '2026-11-03': { preorder: 2, custom: 2 },
    '2026-12-06': { preorder: 0, custom: 1 },
  });
  assert.deepEqual(data.selected.groups, [{
    key: 'product-5', product_id: '5', design_id: null, availability_type: 'preorder', quantity: 3, name: 'Sourdough', design_label: null,
    orders: [{ order_number: 'OVC-261028-005', order_status: 'sedang_disiapkan', quantity: 3, time_slot: '09.00–11.00', fulfillment_type: 'pickup' }],
  }]);
});

test('tanggal terpilih: per produk (jumlah digabung per pesanan), custom cake per desain dengan label, pre-order dulu', async () => {
  const { json } = await get('?month=2026-11&date=2026-11-03');
  assert.equal(json.data.selected.date, '2026-11-03');
  assert.deepEqual(json.data.selected.groups, [
    {
      key: 'product-3', product_id: '3', design_id: null, availability_type: 'preorder', quantity: 7, name: 'Premium Birthday Cake', design_label: null,
      orders: [
        { order_number: 'OVC-261028-001', order_status: 'dikonfirmasi', quantity: 3, time_slot: '09.00–11.00', fulfillment_type: 'pickup' },
        { order_number: 'OVC-261028-002', order_status: 'selesai', quantity: 4, time_slot: '13.00–15.00', fulfillment_type: 'delivery' },
      ],
    },
    {
      key: 'design-60', product_id: '6', design_id: '60', availability_type: 'custom', quantity: 1, name: 'Custom Celebration Cake',
      design_label: 'Diameter 20 cm · Bulat · Cokelat · Tulisan "Happy Birthday"',
      orders: [{ order_number: 'OVC-261028-001', order_status: 'dikonfirmasi', quantity: 1, time_slot: '09.00–11.00', fulfillment_type: 'pickup' }],
    },
    {
      key: 'design-61', product_id: '6', design_id: '61', availability_type: 'custom', quantity: 1, name: 'Custom Celebration Cake',
      design_label: 'Diameter 24 cm',
      orders: [{ order_number: 'OVC-261028-002', order_status: 'selesai', quantity: 1, time_slot: '13.00–15.00', fulfillment_type: 'delivery' }],
    },
  ]);
});

test('bulan lain: tanggal default tgl 1; tanggal di luar bulan → tgl 1; tanggal tanpa bulan → bulan tanggal itu', async () => {
  let { json } = await get('?month=2026-12');
  assert.deepEqual([json.data.month_key, json.data.selected.date], ['2026-12', '2026-12-01']);
  assert.deepEqual(json.data.counts, { '2026-12-06': { preorder: 0, custom: 1 }, '2026-12-07': { preorder: 1, custom: 0 } });
  ({ json } = await get('?month=2026-12&date=2026-11-03'));
  assert.deepEqual([json.data.month_key, json.data.selected.date, json.data.selected.groups], ['2026-12', '2026-12-01', []]);
  ({ json } = await get('?date=2027-02-14'));
  assert.deepEqual([json.data.month_key, json.data.selected.date, json.data.weeks.length], ['2027-02', '2027-02-14', 4]);
  ({ json } = await get('?month=2026-11&date=2026-11-03&extra=1'));
  assert.equal(json.data.selected.date, '2026-11-03'); // parameter lain diabaikan
});

test('validasi bulan & tanggal: format/kalender tidak sah, di luar rentang DATE MySQL, parameter ganda → 400', async () => {
  for (const query of [
    '?month=2026-13', '?month=2026-00', '?month=2026-1', '?month=26-11', '?month=0999-12', '?month=9999-12', '?month=abc',
    '?date=2026-02-30', '?date=2026-11-3', '?date=0999-12-31', '?month=2026-11&date=x', '?month=2026-11&month=2026-12',
  ]) {
    const res = await get(query);
    assert.equal(res.status, 400, query);
    assert.match(res.json.message, /^(Bulan|Tanggal) tidak valid\.$/, query);
  }
  assert.equal((await get('?month=9999-11')).status, 200);
  assert.equal((await get('?month=1000-01')).status, 200);
});

test('database gagal → 500 tanpa detail', async () => {
  failOn = true;
  const res = await get();
  assert.deepEqual([res.status, res.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
});
