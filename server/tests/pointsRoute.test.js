// Regresi tingkat HTTP: GET /api/me/points (FR-05 · FR-22 · BR-09 · TF-11) — auth, peran, pelanggan tanpa
// riwayat, isolasi antar-pelanggan, bentuk respons sesuai client services/loyaltyService.js, dan error database.
// Prisma dipalsukan (point_transactions & store_settings di memori); server Express dijalankan di port acak.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const { getJakartaYear } = require('../src/services/loyaltyRules.service');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
  6: { userId: 6n, role: 'customer', isActive: true },
};

// Kolom DECIMAL dikirim Prisma sebagai Decimal; string meniru nilai yang perlu dikonversi Number()
const defaultStoreRow = {
  settingId: 1, earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
  goldMinPoints: 500, platinumMinPoints: 2000,
};

const thisYear = getJakartaYear(new Date());
const inYear = (year, month = 5) => new Date(Date.UTC(year, month, 15, 5));

let storeRow;
let transactions;
let pointQueries;
let failPointQuery;

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.storeSetting = { findFirst: async () => storeRow };
fakePrisma.pointTransaction = {
  findMany: async ({ where, select }) => {
    pointQueries.push(where);
    if (failPointQuery) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    return transactions
      .filter((tx) => matchesWhere(tx, where))
      .map((tx) => Object.fromEntries(Object.keys(select).map((key) => [key, tx[key]])));
  },
};

const tx = (userId, type, points, createdAt) => ({ userId: BigInt(userId), type, points, createdAt });

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me/points`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  storeRow = { ...defaultStoreRow };
  pointQueries = [];
  failPointQuery = false;
  transactions = [
    // Pelanggan 1: Gold tahun ini (earn 400 + bonus 120 = 520), poin tahun lalu tidak dihitung untuk level
    tx(1, 'earn', 900, inYear(thisYear - 1)),
    tx(1, 'earn', 400, inYear(thisYear, 2)),
    tx(1, 'review_bonus', 120, inYear(thisYear, 3)),
    tx(1, 'redeem', -300, inYear(thisYear, 4)),
    tx(1, 'refund', 50, inYear(thisYear, 5)),
    // Pelanggan 2: Platinum, data yang tidak boleh bocor ke pelanggan 1
    tx(2, 'earn', 2500, inYear(thisYear)),
  ];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (token, query = '') => {
  const res = await fetch(`${baseUrl}${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, json: await res.json() };
};

test('tamu (tanpa token) → 401, bukan 404', async () => {
  const { status, json } = await call();
  assert.equal(status, 401);
  assert.deepEqual(json, { status: 'error', message: 'Autentikasi diperlukan.' });
  assert.equal(pointQueries.length, 0);
});

test('token rusak, kedaluwarsa, salah secret, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
  const wrongSecret = jwt.sign({ sub: '1' }, 'secret-lain', { algorithm: 'HS256' });

  for (const token of ['token-palsu', expired, wrongSecret, tokenFor('5')]) {
    const { status, json } = await call(token);
    assert.equal(status, 401);
    assert.equal(json.code, 'SESSION_INVALID');
  }
  assert.equal(pointQueries.length, 0);
});

test('staf dan owner → 403 tanpa kode sesi', async () => {
  for (const sub of ['3', '4']) {
    const { status, json } = await call(tokenFor(sub));
    assert.equal(status, 403);
    assert.equal(json.code, undefined);
  }
  assert.equal(pointQueries.length, 0);
});

test('pelanggan tanpa riwayat poin → saldo 0, level Silver, 500 poin menuju Gold', async () => {
  const { status, json } = await call(tokenFor('6'));

  assert.equal(status, 200);
  assert.deepEqual(json, {
    status: 'success',
    data: {
      balance: 0,
      redeemValue: 0,
      yearlyPoints: 0,
      level: { key: 'silver', label: 'Silver Member', badge: 'silver' },
      nextLevel: { key: 'gold', label: 'Gold Member', badge: 'gold' },
      pointsToNext: 500,
      settings: { earn_amount_per_point: 1000, gold_min_points: 500, platinum_min_points: 2000 },
    },
  });
});

test('saldo = Σ semua transaksi; level dari earn + review_bonus tahun ini saja', async () => {
  const { status, json } = await call(tokenFor('1'));

  assert.equal(status, 200);
  // 900 + 400 + 120 − 300 + 50 = 1.170 → ⌊1170/100⌋ × 5.000 = Rp 55.000
  assert.equal(json.data.balance, 1170);
  assert.equal(json.data.redeemValue, 55000);
  // Tahun ini: 400 + 120 (redeem, refund, dan tahun lalu tidak dihitung)
  assert.equal(json.data.yearlyPoints, 520);
  assert.equal(json.data.level.key, 'gold');
  assert.equal(json.data.nextLevel.key, 'platinum');
  assert.equal(json.data.pointsToNext, 1480);
});

test('isolasi: identitas dari token, bukan dari query; data pelanggan lain tidak terbawa', async () => {
  const one = await call(tokenFor('1'), '?userId=2&user_id=2');
  const two = await call(tokenFor('2'));

  assert.equal(one.json.data.balance, 1170);
  assert.deepEqual(pointQueries.map((where) => where.userId), [1n, 2n]);
  assert.equal(two.json.data.balance, 2500);
  assert.equal(two.json.data.level.key, 'platinum');
  assert.equal(two.json.data.nextLevel, null);
  assert.equal(two.json.data.pointsToNext, 0);
});

test('ambang level & nilai tukar mengikuti store_settings (AD-09), bukan konstanta', async () => {
  storeRow = { ...defaultStoreRow, redeemPointsUnit: 50, redeemValue: '2000.00', goldMinPoints: 100, platinumMinPoints: 500 };

  const { json } = await call(tokenFor('1'));

  assert.equal(json.data.redeemValue, Math.floor(1170 / 50) * 2000);
  assert.equal(json.data.level.key, 'platinum');
  assert.deepEqual(json.data.settings, { earn_amount_per_point: 1000, gold_min_points: 100, platinum_min_points: 500 });
});

test('error database → 500 dengan pesan umum, tanpa kode internal Prisma', async (t) => {
  t.mock.method(console, 'error', () => {});
  failPointQuery = true;

  const { status, json } = await call(tokenFor('1'));

  assert.equal(status, 500);
  assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});

test('store_settings kosong → 500, saldo tidak dikarang dari nilai default', async (t) => {
  t.mock.method(console, 'error', () => {});
  storeRow = null;

  const { status, json } = await call(tokenFor('1'));

  assert.equal(status, 500);
  assert.equal(json.status, 'error');
  assert.equal(json.data, undefined);
});
