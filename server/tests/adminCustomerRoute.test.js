// Regresi tingkat HTTP Step 6.4.8: GET /api/admin/customers (FR-35 · UC-25 · AD-10 tab Pelanggan). Staf & Owner;
// hanya pengguna ber-role customer; total pesanan (tidak dibatalkan), total belanja (lunas & tidak dibatalkan), level
// dari poin earn + review_bonus tahun berjalan WIB, pesanan terakhir; tanpa data sensitif; satu snapshot baca
// REPEATABLE READ dengan semua query lewat `tx` berurutan. Prisma dipalsukan — query MySQL dibuktikan di uji integrasi.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

// 2026-10-31 23.30 UTC = 1 Nov 2026 06.30 WIB → tahun level = 2026
const NOW = new Date('2026-10-31T23:30:00.000Z');

let tables;
let failOn;

function seed() {
  const u = (userId, name, role, extra = {}) => ({
    userId: BigInt(userId), name, email: `u${userId}@demo.com`, phone: `+6281000${userId}`, role, isActive: true,
    passwordHash: '$2b$10$rahasia', googleId: null, ...extra,
  });
  const o = (userId, createdAt, total, paymentStatus, orderStatus) => ({ userId: BigInt(userId), createdAt: new Date(createdAt), total, paymentStatus, orderStatus });
  const p = (userId, type, points, createdAt) => ({ userId: BigInt(userId), type, points, createdAt: new Date(createdAt) });
  return {
    storeSetting: { goldMinPoints: 500, platinumMinPoints: 2000 },
    users: [
      u(1, 'Anisa Pelanggan', 'customer'),
      u(3, 'Budi Staf', 'staf'),
      u(4, 'Citra Owner', 'owner'),
      u(5, 'Budi Nonaktif', 'customer', { isActive: false }),
      u(6, 'Citra Pelanggan', 'customer'),
      u(7, 'Andi Pelanggan', 'customer'),
    ],
    orders: [
      o(1, '2026-10-30T03:00:00Z', '150000.50', 'paid', 'selesai'),
      o(1, '2026-10-31T10:00:00Z', '50000.00', 'unpaid', 'menunggu_pembayaran'),
      o(1, '2026-10-31T12:00:00Z', '70000.00', 'refunded', 'dibatalkan'), // terbaru: tetap "pesanan terakhir"
      o(6, '2026-10-29T03:00:00Z', '100000.25', 'paid', 'dikonfirmasi'),
      o(6, '2026-10-20T03:00:00Z', '0.25', 'paid', 'selesai'),
      o(7, '2026-10-29T03:00:00Z', '20000.00', 'unpaid', 'menunggu_pembayaran'), // waktu sama dengan pesanan Citra
      o(3, '2026-10-31T13:00:00Z', '99999.00', 'paid', 'selesai'), // pesanan akun staf (tidak tampil)
    ],
    points: [
      p(1, 'earn', 480, '2026-10-30T05:00:00Z'),
      p(1, 'review_bonus', 20, '2025-12-31T17:30:00Z'), // 1 Jan 2026 00.30 WIB → tahun ini
      p(1, 'earn', 1000, '2025-12-31T16:30:00Z'), // 31 Des 2025 23.30 WIB → tahun lalu
      p(1, 'redeem', -100, '2026-10-30T05:00:00Z'),
      p(6, 'earn', 2000, '2026-10-29T05:00:00Z'),
      p(7, 'refund', 300, '2026-10-29T05:00:00Z'), // refund bukan poin yang diperoleh
    ],
  };
}

const dbFailure = () => Object.assign(new Error("Can't reach database server"), { code: 'P1001' });
const pick = (row, select) => Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));

function groupBy({ by, where, _count, _sum, _max }) {
  assert.deepEqual(by, ['userId']);
  const groups = new Map();
  for (const row of tables.orders.filter((r) => matchesWhere(r, where))) {
    const key = String(row.userId);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((rows) => ({
    userId: rows[0].userId,
    ...(_count ? { _count: { _all: rows.length } } : {}),
    ...(_sum ? { _sum: { total: (rows.reduce((s, r) => s + Math.round(Number(r.total) * 100), 0) / 100).toFixed(2) } } : {}),
    ...(_max ? { _max: { createdAt: new Date(Math.max(...rows.map((r) => r.createdAt))) } } : {}),
  }));
}

const models = {
  storeSetting: { findFirst: async () => tables.storeSetting },
  user: {
    findMany: async ({ where, orderBy, select }) => {
      if (failOn) throw dbFailure();
      assert.deepEqual(orderBy, { userId: 'asc' });
      return tables.users.filter((r) => matchesWhere(r, where)).map((r) => pick(r, select));
    },
  },
  order: { groupBy: async (args) => groupBy(args) },
  pointTransaction: { findMany: async ({ where, select }) => tables.points.filter((r) => matchesWhere(r, where)).map((r) => pick(r, select)) },
};

// Penjaga snapshot: query Dashboard pelanggan WAJIB lewat tx; Prisma global hanya untuk auth (user.findUnique)
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
fakePrisma.user.findUnique = async ({ where }) => tables.users.find((u) => u.userId === BigInt(where.userId)) ?? null;
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
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/customers`;
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
const get = async (token = tokenFor('3')) => {
  const res = await fetch(baseUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

test('Staf & Owner 200; tamu 401, token tidak valid SESSION_INVALID, pelanggan 403 (tanpa transaksi dibuka)', async () => {
  assert.equal((await get(null)).status, 401);
  assert.equal((await get('token-palsu')).json.code, 'SESSION_INVALID');
  assert.equal((await get(tokenFor('1'))).status, 403);
  assert.deepEqual(txCalls, []);
  assert.equal((await get(tokenFor('3'))).status, 200);
  assert.equal((await get(tokenFor('4'))).status, 200);
});

test('snapshot baca: satu transaksi REPEATABLE READ, semua query lewat tx, berurutan', async () => {
  assert.equal((await get()).status, 200);
  assert.equal(txCalls.length, 1);
  assert.equal(txCalls[0].isolationLevel, 'RepeatableRead');
  assert.deepEqual(globalCalls, []);
  assert.equal(overlapped, false);
  assert.deepEqual(queryLog, ['storeSetting.findFirst', 'user.findMany', 'order.groupBy', 'order.groupBy', 'order.groupBy', 'pointTransaction.findMany']);
});

test('baris pelanggan: hanya customer, agregat & level benar, urut pesanan terakhir, tanpa data sensitif', async () => {
  const { status, json } = await get();
  assert.equal(status, 200);
  const rows = json.data;
  assert.deepEqual(rows.map((r) => r.user_id), ['1', '7', '6', '5']); // staf/owner tidak tampil; Andi < Citra (seri)
  assert.deepEqual(rows[0], {
    user_id: '1', name: 'Anisa Pelanggan', email: 'u1@demo.com', phone: '+62810001', is_active: true,
    total_orders: 2, // dibatalkan tidak dihitung
    total_spend: 150000.5, // hanya lunas & tidak dibatalkan
    level: { key: 'gold', label: 'Gold Member', badge: 'gold' }, // 480 + 20 (1 Jan WIB); 1000 tahun lalu & redeem diabaikan
    last_order_at: '2026-10-31T12:00:00.000Z', // pesanan batal tetap terhitung sebagai pesanan terakhir
  });
  const byId = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  assert.deepEqual([byId[6].total_orders, byId[6].total_spend, byId[6].level.key], [2, 100000.5, 'platinum']);
  assert.deepEqual([byId[7].total_orders, byId[7].total_spend, byId[7].level.key], [1, 0, 'silver']); // refund bukan perolehan
  assert.deepEqual([byId[5].total_orders, byId[5].total_spend, byId[5].level.key, byId[5].last_order_at, byId[5].is_active], [0, 0, 'silver', null, false]);
  for (const r of rows) {
    assert.deepEqual(Object.keys(r).sort(), ['email', 'is_active', 'last_order_at', 'level', 'name', 'phone', 'total_orders', 'total_spend', 'user_id']);
  }
  assert.ok(!JSON.stringify(json).includes('rahasia'));
});

test('ambang level mengikuti store_settings terbaru (aturan AD-09)', async () => {
  tables.storeSetting = { goldMinPoints: 100, platinumMinPoints: 400 };
  const rows = (await get()).json.data;
  assert.equal(rows.find((r) => r.user_id === '1').level.key, 'platinum');
});

test('tanpa pelanggan → array kosong; gagal basis data → 500 pesan umum', async (t) => {
  tables.users = tables.users.filter((u) => u.role !== 'customer');
  assert.deepEqual((await get()).json.data, []);
  t.mock.method(console, 'error', () => {});
  tables = seed();
  failOn = true;
  const { status, json } = await get();
  assert.deepEqual([status, json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
});
