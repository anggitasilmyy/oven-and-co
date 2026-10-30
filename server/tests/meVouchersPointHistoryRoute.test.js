// Regresi tingkat HTTP: GET /api/me/vouchers & GET /api/me/points/history (FR-22 · FR-23 · BR-10 · C-21) —
// auth, peran, data kosong, isolasi antar-pelanggan, bentuk respons sesuai client services/loyaltyService.js
// (getMyVouchers, getMyPointHistory), status & urutan voucher, dan error database.
// Prisma dipalsukan (user_vouchers, vouchers, products, point_transactions, orders di memori).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const { getJakartaDateKey, addDaysToDateKey, dateKeyToDbDate } = require('../src/utils/jakartaDate');
const { getVoucherState } = require('../src/services/myVoucher.service');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
  6: { userId: 6n, role: 'customer', isActive: true },
};

const today = getJakartaDateKey(new Date());
const day = (offset) => dateKeyToDbDate(addDaysToDateKey(today, offset));

const products = [
  { productId: 1n, name: 'Classic Butter Croissant', availabilityType: 'ready' },
  { productId: 6n, name: 'Custom Celebration Cake', availabilityType: 'custom' },
];

const voucher = (overrides) => ({
  title: 'Voucher', discountType: 'fixed', discountValue: '10000.00', productId: null, quota: 50,
  validFrom: day(-10), validTo: day(10), isActive: true, ...overrides,
});

// Voucher 6 aktif tetapi TIDAK diklaim siapa pun → tidak boleh muncul
const vouchers = [
  voucher({ voucherId: 1n, code: 'HEMAT10', validTo: day(20) }),
  voucher({ voucherId: 2n, code: 'WEEKEND15', discountType: 'percent', discountValue: '15.00', productId: 6n, validTo: day(5) }),
  voucher({ voucherId: 3n, code: 'LEWAT', validFrom: day(-30), validTo: day(-1) }),
  voucher({ voucherId: 4n, code: 'HABIS', quota: 0 }),
  voucher({ voucherId: 5n, code: 'TERPAKAI', productId: 1n }),
  voucher({ voucherId: 6n, code: 'BELUMKLAIM' }),
  voucher({ voucherId: 7n, code: 'PRIBADI2' }),
];

const orders = [
  { orderId: 10n, orderNumber: 'OVC-261001-001' },
  { orderId: 11n, orderNumber: 'OVC-261002-001' },
];

const claim = (userId, voucherId, usedAt = null) => ({
  userId: BigInt(userId), voucherId: BigInt(voucherId), claimedAt: new Date('2026-10-01T02:00:00Z'), usedAt,
});

let userVouchers;
let pointTransactions;
let queries;
let failTable;

// orderBy Prisma: [{ field: 'asc' | 'desc' }, ...]
const sortBy = (rows, orderBy = []) =>
  [...rows].sort((a, b) => {
    for (const clause of [].concat(orderBy)) {
      const [field, dir] = Object.entries(clause)[0];
      if (a[field] < b[field]) return dir === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });

const dbFailure = () => Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.userVoucher = {
  findMany: async ({ where, include, orderBy }) => {
    queries.push({ table: 'userVoucher', where });
    if (failTable === 'userVoucher') throw dbFailure();
    assert.ok(include?.voucher?.include?.product, 'relasi produk voucher harus di-include');
    return sortBy(userVouchers.filter((row) => matchesWhere(row, where)), orderBy).map((row) => {
      const v = vouchers.find((item) => item.voucherId === row.voucherId);
      return { ...row, voucher: v && { ...v, product: products.find((p) => p.productId === v.productId) ?? null } };
    });
  },
};
fakePrisma.pointTransaction = {
  findMany: async ({ where, include, orderBy }) => {
    queries.push({ table: 'pointTransaction', where });
    if (failTable === 'pointTransaction') throw dbFailure();
    assert.ok(include?.order, 'relasi pesanan harus di-include');
    return sortBy(pointTransactions.filter((row) => matchesWhere(row, where)), orderBy).map((row) => ({
      ...row,
      order: orders.find((o) => o.orderId === row.orderId) ?? null,
    }));
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  queries = [];
  failTable = null;
  userVouchers = [
    claim(1, 3), claim(1, 1), claim(1, 5, new Date('2026-10-05T03:00:00Z')), claim(1, 4), claim(1, 2),
    claim(2, 7), claim(2, 1, new Date('2026-10-06T03:00:00Z')),
  ];
  pointTransactions = [
    { pointTxId: 1n, userId: 1n, type: 'earn', points: 500, orderId: 10n, reviewId: null, createdAt: new Date('2026-10-01T09:00:00Z') },
    { pointTxId: 2n, userId: 1n, type: 'review_bonus', points: 20, orderId: null, reviewId: 7n, createdAt: new Date('2026-10-03T09:00:00Z') },
    { pointTxId: 3n, userId: 1n, type: 'redeem', points: -100, orderId: 11n, reviewId: null, createdAt: new Date('2026-10-03T09:00:00Z') },
    { pointTxId: 4n, userId: 2n, type: 'earn', points: 999, orderId: null, reviewId: null, createdAt: new Date('2026-10-04T09:00:00Z') },
  ];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (path, token) => {
  const res = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

const ENDPOINTS = ['/vouchers', '/points/history'];

test('tamu (tanpa token) → 401 di kedua endpoint, bukan 404', async () => {
  for (const path of ENDPOINTS) {
    const { status, json } = await call(path);
    assert.equal(status, 401, path);
    assert.deepEqual(json, { status: 'error', message: 'Autentikasi diperlukan.' });
  }
  assert.equal(queries.length, 0);
});

test('token rusak, kedaluwarsa, salah secret, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
  const wrongSecret = jwt.sign({ sub: '1' }, 'secret-lain', { algorithm: 'HS256' });

  for (const path of ENDPOINTS) {
    for (const token of ['token-palsu', expired, wrongSecret, tokenFor('5')]) {
      const { status, json } = await call(path, token);
      assert.equal(status, 401, path);
      assert.equal(json.code, 'SESSION_INVALID');
    }
  }
  assert.equal(queries.length, 0);
});

test('staf dan owner → 403 tanpa kode sesi', async () => {
  for (const path of ENDPOINTS) {
    for (const sub of ['3', '4']) {
      const { status, json } = await call(path, tokenFor(sub));
      assert.equal(status, 403, path);
      assert.equal(json.code, undefined);
    }
  }
  assert.equal(queries.length, 0);
});

test('pelanggan tanpa voucher & tanpa transaksi → 200 [] (voucher aktif yang tidak diklaim tidak ikut)', async () => {
  for (const path of ENDPOINTS) {
    assert.deepEqual((await call(path, tokenFor('6'))).json, { status: 'success', data: [] }, path);
  }
});

test('GET /vouchers: bentuk { claim, voucher, state, product } dengan id string', async () => {
  const { status, json } = await call('/vouchers', tokenFor('1'));
  assert.equal(status, 200);

  const weekend = json.data.find((item) => item.voucher.code === 'WEEKEND15');
  assert.deepEqual(weekend, {
    claim: { user_id: '1', voucher_id: '2', claimed_at: '2026-10-01T02:00:00.000Z', used_at: null },
    voucher: {
      voucher_id: '2', code: 'WEEKEND15', title: 'Voucher', discount_type: 'percent', discount_value: 15,
      product_id: '6', quota: 50, valid_from: addDaysToDateKey(today, -10), valid_to: addDaysToDateKey(today, 5),
      is_active: true,
    },
    state: 'usable',
    product: { product_id: '6', name: 'Custom Celebration Cake', availability_type: 'custom' },
  });
  assert.equal(json.data.find((item) => item.voucher.code === 'HEMAT10').product, null);
});

test('GET /vouchers: status & urutan — bisa dipakai → sudah dipakai → tidak berlaku, lalu paling cepat berakhir', async () => {
  const { json } = await call('/vouchers', tokenFor('1'));

  assert.deepEqual(
    json.data.map((item) => [item.voucher.code, item.state]),
    [
      ['WEEKEND15', 'usable'], // berakhir H+5
      ['HEMAT10', 'usable'], // berakhir H+20
      ['TERPAKAI', 'used'],
      ['LEWAT', 'expired'], // periode lewat
      ['HABIS', 'expired'], // kuota 0
    ]
  );
  assert.equal(json.data.find((item) => item.state === 'used').claim.used_at, '2026-10-05T03:00:00.000Z');
});

test('GET /vouchers: isolasi — identitas dari token, status klaim milik pelanggan sendiri', async () => {
  const one = await call('/vouchers?userId=2&user_id=2', tokenFor('1'));
  const two = await call('/vouchers', tokenFor('2'));

  assert.deepEqual(queries.map((q) => q.where.userId), [1n, 2n]);
  assert.ok(one.json.data.every((item) => item.claim.user_id === '1'));
  assert.ok(!one.json.data.some((item) => item.voucher.code === 'PRIBADI2'));
  // HEMAT10 bisa dipakai pelanggan 1, tetapi sudah dipakai pelanggan 2
  assert.equal(one.json.data.find((item) => item.voucher.code === 'HEMAT10').state, 'usable');
  assert.deepEqual(two.json.data.map((item) => [item.voucher.code, item.state]), [['PRIBADI2', 'usable'], ['HEMAT10', 'used']]);
});

test('GET /points/history: terbaru dulu (seri waktu → id terbesar), nomor pesanan terkait, id string', async () => {
  const { status, json } = await call('/points/history', tokenFor('1'));

  assert.equal(status, 200);
  assert.deepEqual(json.data, [
    {
      point_tx_id: '3', user_id: '1', type: 'redeem', points: -100, order_id: '11', review_id: null,
      created_at: '2026-10-03T09:00:00.000Z', order_number: 'OVC-261002-001',
    },
    {
      point_tx_id: '2', user_id: '1', type: 'review_bonus', points: 20, order_id: null, review_id: '7',
      created_at: '2026-10-03T09:00:00.000Z', order_number: null,
    },
    {
      point_tx_id: '1', user_id: '1', type: 'earn', points: 500, order_id: '10', review_id: null,
      created_at: '2026-10-01T09:00:00.000Z', order_number: 'OVC-261001-001',
    },
  ]);
});

test('GET /points/history: isolasi — query parameter diabaikan, transaksi pelanggan lain tidak terbawa', async () => {
  const one = await call('/points/history?userId=2', tokenFor('1'));
  const two = await call('/points/history', tokenFor('2'));

  assert.deepEqual(queries.map((q) => q.where.userId), [1n, 2n]);
  assert.ok(one.json.data.every((tx) => tx.user_id === '1'));
  assert.deepEqual(two.json.data.map((tx) => tx.point_tx_id), ['4']);
});

test('error database → 500 dengan pesan umum, tanpa kode internal Prisma', async (t) => {
  t.mock.method(console, 'error', () => {});

  for (const [path, table] of [['/vouchers', 'userVoucher'], ['/points/history', 'pointTransaction']]) {
    failTable = table;
    const { status, json } = await call(path, tokenFor('1'));
    assert.equal(status, 500, path);
    assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

test('getVoucherState: batas periode inklusif, nonaktif/kuota habis → expired, used_at mengalahkan semuanya', () => {
  const base = { is_active: true, quota: 1, valid_from: '2026-10-10', valid_to: '2026-10-20' };
  const unused = { used_at: null };

  assert.equal(getVoucherState(unused, base, '2026-10-10'), 'usable');
  assert.equal(getVoucherState(unused, base, '2026-10-20'), 'usable');
  assert.equal(getVoucherState(unused, base, '2026-10-09'), 'expired');
  assert.equal(getVoucherState(unused, base, '2026-10-21'), 'expired');
  assert.equal(getVoucherState(unused, { ...base, is_active: false }, '2026-10-15'), 'expired');
  assert.equal(getVoucherState(unused, { ...base, quota: 0 }, '2026-10-15'), 'expired');
  assert.equal(getVoucherState({ used_at: '2026-10-11T00:00:00.000Z' }, { ...base, quota: 0 }, '2026-10-15'), 'used');
});
