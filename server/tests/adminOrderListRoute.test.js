// Regresi tingkat HTTP: GET /api/admin/orders (FR-28 · AD-03). Bug: server mengirim { orders, pagination } padahal
// PesananAdminPage membaca { rows, tabCounts, totalFiltered, page, totalPages, pageSize } → "Cannot read properties
// of undefined (reading 'length')". Kontrak = client services/adminOrderService.js getAdminOrders (+ mock).
// Prisma dipalsukan (filter dinilai dengan whereMatch) — tidak membuktikan query MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true, name: 'Anisa Pelanggan' },
  2: { userId: 2n, role: 'customer', isActive: true, name: 'Budi' },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'staf', isActive: false },
};
const methods = { qris: 'QRIS', bca_va: 'BCA Virtual Account', pay_at_store: 'Bayar di Toko' };

// 13 pesanan: 1 jam berselang (terbaru = id terbesar), WIB 20 Okt 2026 pukul 08.00 mundur
const statuses = ['menunggu_pembayaran', 'dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai', 'dibatalkan'];
function buildOrders() {
  return Array.from({ length: 13 }, (_, i) => {
    const id = BigInt(i + 1);
    const fulfillment = i % 3 === 0 ? 'delivery' : 'pickup';
    return {
      orderId: id,
      orderNumber: `OVC-2610${i < 6 ? '19' : '20'}-${String(i + 1).padStart(3, '0')}`,
      userId: i % 2 === 0 ? 1n : 2n,
      user: users[i % 2 === 0 ? 1 : 2],
      fulfillmentType: fulfillment,
      readyDate: new Date('2026-10-20T00:00:00.000Z'),
      timeSlot: '09.00–11.00',
      total: '28000.00',
      paymentOption: i === 12 ? 'pay_at_store' : 'online',
      paymentStatus: 'unpaid',
      orderStatus: statuses[i % statuses.length],
      createdAt: new Date(Date.UTC(2026, 9, 19, 12 + i)), // 19 Okt 19.00 WIB … 20 Okt 07.00 WIB
      payments: [{ paymentId: id * 10n, methodCode: i === 12 ? 'pay_at_store' : i % 2 ? 'bca_va' : 'qris' }],
      items: [
        { orderItemId: id * 100n, quantity: 2, product: { name: 'Classic Butter Croissant' } },
        ...(i % 4 === 0 ? [{ orderItemId: id * 100n + 1n, quantity: 1, product: { name: 'Cinnamon Roll' } }] : []),
      ],
    };
  });
}

let orders;
let queries;
let failOn;

const sortBy = (rows, orderBy = []) =>
  [...rows].sort((a, b) => {
    for (const clause of [].concat(orderBy)) {
      const [field, dir] = Object.entries(clause)[0];
      if (a[field] < b[field]) return dir === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.order = {
  groupBy: async ({ by, where }) => {
    queries.push({ op: 'groupBy', where });
    if (failOn === 'groupBy') throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    assert.deepEqual(by, ['orderStatus']);
    const counts = new Map();
    orders.filter((o) => matchesWhere(o, where)).forEach((o) => counts.set(o.orderStatus, (counts.get(o.orderStatus) ?? 0) + 1));
    return [...counts].map(([orderStatus, count]) => ({ orderStatus, _count: { _all: count } }));
  },
  findMany: async ({ where, orderBy, skip, take, include }) => {
    queries.push({ op: 'findMany', where, skip, take });
    return sortBy(orders.filter((o) => matchesWhere(o, where)), orderBy).slice(skip, skip + take).map((o) => ({
      ...o,
      user: include.user ? { name: o.user.name } : undefined,
      payments: sortBy(o.payments, include.payments.orderBy).slice(0, include.payments.take)
        .map((p) => ({ ...p, method: { name: methods[p.methodCode] } })),
      items: sortBy(o.items, include.items.orderBy),
    }));
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/orders`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  orders = buildOrders();
  queries = [];
  failOn = null;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (query = '', token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('tamu 401, token tidak valid/akun nonaktif 401 SESSION_INVALID, pelanggan 403; staf & owner 200', async () => {
  assert.equal((await call('', null)).status, 401);
  for (const token of ['token-palsu', tokenFor('5')]) assert.equal((await call('', token)).json.code, 'SESSION_INVALID');
  assert.equal((await call('', tokenFor('1'))).status, 403);
  assert.equal((await call('', tokenFor('3'))).status, 200);
  assert.equal((await call('', tokenFor('4'))).status, 200);
});

test('bentuk respons sesuai kontrak halaman AD-03 (rows, tabCounts, totalFiltered, page, totalPages, pageSize)', async () => {
  const { status, json } = await call();

  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json.data).sort(), ['page', 'pageSize', 'rows', 'tabCounts', 'totalFiltered', 'totalPages']);
  assert.deepEqual(
    { ...json.data, rows: undefined },
    {
      rows: undefined,
      tabCounts: {
        semua: 13, menunggu_pembayaran: 2, dikonfirmasi: 2, sedang_disiapkan: 2, siap: 4, selesai: 2, dibatalkan: 1,
      },
      totalFiltered: 13, page: 1, totalPages: 2, pageSize: 10,
    }
  );
  assert.equal(json.data.rows.length, 10);
  // Terbaru dulu; baris = bentuk mock getAdminOrderRows
  assert.deepEqual(json.data.rows[0], {
    order_id: '13', order_number: 'OVC-261020-013', created_at: '2026-10-20T00:00:00.000Z', customer_name: 'Anisa Pelanggan',
    fulfillment_type: 'delivery', ready_date: '2026-10-20', time_slot: '09.00–11.00', total: 28000,
    payment_option: 'pay_at_store', payment_status: 'unpaid', method_code: 'pay_at_store', method_name: 'Bayar di Toko',
    order_status: 'selesai', item_count: 3, items_summary: 'Classic Butter Croissant ×2, +1 lainnya',
  });
  assert.equal(json.data.rows[1].items_summary, 'Classic Butter Croissant ×2');
  assert.deepEqual(json.data.rows.map((r) => r.order_id), ['13', '12', '11', '10', '9', '8', '7', '6', '5', '4']);
});

test('halaman 2 berisi sisa baris; halaman di luar rentang disesuaikan ke halaman terakhir (sama dengan mock)', async () => {
  const second = await call('?page=2');
  assert.deepEqual([second.json.data.page, second.json.data.rows.map((r) => r.order_id)], [2, ['3', '2', '1']]);

  const beyond = await call('?page=99');
  assert.equal(beyond.json.data.page, 2);
  assert.equal(beyond.json.data.rows.length, 3);
});

test('tab: hanya status tab tersebut; tab "siap" = Siap Diambil + Dalam Pengiriman; tabCounts tetap semua tab', async () => {
  const { json } = await call('?tab=siap');

  assert.deepEqual(json.data.rows.map((r) => r.order_status).sort(), ['dalam_pengiriman', 'dalam_pengiriman', 'siap_diambil', 'siap_diambil']);
  assert.equal(json.data.totalFiltered, 4);
  assert.equal(json.data.tabCounts.semua, 13);
});

test('filter nomor pesanan, tanggal (WIB), pickup/delivery, metode bayar; tabCounts mengikuti filter', async () => {
  const search = await call('?search=ovc-261019');
  assert.deepEqual(search.json.data.rows.map((r) => r.order_number).sort(), [
    'OVC-261019-001', 'OVC-261019-002', 'OVC-261019-003', 'OVC-261019-004', 'OVC-261019-005', 'OVC-261019-006',
  ]);
  assert.equal(search.json.data.tabCounts.semua, 6);

  // 20 Okt WIB dimulai 19 Okt 17.00 UTC → pesanan i ≥ 5 (dibuat 17.00 UTC ke atas)
  const dated = await call('?dateFrom=2026-10-20&dateTo=2026-10-20');
  assert.equal(dated.json.data.totalFiltered, 8);
  assert.ok(dated.json.data.rows.every((r) => r.created_at >= '2026-10-19T17:00:00.000Z'));
  assert.equal((await call('?dateTo=2026-10-19')).json.data.totalFiltered, 5);

  const delivery = await call('?fulfillment=delivery');
  assert.ok(delivery.json.data.rows.every((r) => r.fulfillment_type === 'delivery'));
  assert.equal(delivery.json.data.totalFiltered, 5);

  const method = await call('?methodCode=bca_va&tab=dikonfirmasi');
  assert.ok(method.json.data.rows.every((r) => r.method_code === 'bca_va' && r.order_status === 'dikonfirmasi'));
  assert.equal(method.json.data.tabCounts.semua, 6);
});

test('hasil kosong: rows [] dengan halaman 1 dari 1, tanpa query baris', async () => {
  const { status, json } = await call('?search=OVC-999999');

  assert.equal(status, 200);
  assert.deepEqual({ ...json.data, tabCounts: undefined }, {
    rows: [], tabCounts: undefined, totalFiltered: 0, page: 1, totalPages: 1, pageSize: 10,
  });
  assert.ok(Object.values(json.data.tabCounts).every((n) => n === 0));
  assert.equal(queries.filter((q) => q.op === 'findMany').length, 0);
});

test('parameter tidak valid → 400 dengan pesan Indonesia; parameter lain diabaikan', async () => {
  const cases = [
    ['?tab=apa', 'Tab status pesanan tidak valid.'],
    ['?page=0', 'Halaman tidak valid.'],
    ['?page=abc', 'Halaman tidak valid.'],
    ['?dateFrom=2026-02-30', 'Tanggal awal tidak valid.'],
    ['?fulfillment=kurir', 'Filter pickup/delivery tidak valid.'],
    ['?tab=semua&tab=selesai', 'Tab status pesanan tidak valid.'],
  ];
  for (const [query, message] of cases) {
    const { status, json } = await call(query);
    assert.deepEqual([status, json.message], [400, message], query);
  }
  assert.equal((await call('?status=selesai&limit=999&q=x')).json.data.totalFiltered, 13);
});

test('error database → 500 pesan umum', async (t) => {
  t.mock.method(console, 'error', () => {});
  failOn = 'groupBy';
  assert.deepEqual((await call()).json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});
