// Regresi tingkat HTTP Step 6.4.10 C1: GET /api/admin/settings (FR-36 · UC-30 · A-11 · AD-11). Hanya Owner; kontrak =
// mock settingsAdmin.js buildSettingsBoard { profile, hours, paymentMethods }; tanpa data di luar kontrak (koordinat,
// loyalty, batas waktu bayar, bonus ulasan); satu snapshot REPEATABLE READ, semua query lewat `tx` berurutan, tanpa
// locking read & tanpa Prisma global; tanpa penulisan. Prisma dipalsukan — query MySQL dibuktikan di uji integrasi.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'owner', isActive: false },
};
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const GROUP_ORDER = ['qris', 'ewallet', 'va', 'store']; // urutan enum PaymentMethodGroup (MySQL ORDER BY enum)

let tables;
let failWith;

function seed() {
  const method = (methodCode, name, methodGroup, isActive = true) => ({ methodCode, name, methodGroup, isActive });
  return {
    storeSetting: {
      settingId: 1, storeName: 'Oven & Co.', address: 'Jl. Oven & Co. No. 1, Jakarta', latitude: '-6.2000000', longitude: '106.8000000',
      whatsappNumber: '+620000000000', preorderCutoffTime: time('17:00'), deliveryRadiusKm: '10.00', deliveryFeePerKm: '2500.00',
      paymentTimeoutMinutes: 30, earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
      goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
    },
    operatingHours: [7, 3, 1, 2, 4, 5, 6].map((d) => ({
      hourId: d, dayOfWeek: d, openTime: d === 7 ? null : time(d === 6 ? '08:30' : '07:00'), closeTime: d === 7 ? null : time('20:00'), isOpen: d !== 7,
    })),
    paymentMethods: [
      method('va_bca', 'BCA Virtual Account', 'va'), method('qris', 'QRIS', 'qris'), method('pay_at_store', 'Bayar di Toko', 'store'),
      method('ovo', 'OVO', 'ewallet', false), method('gopay', 'GoPay', 'ewallet'), method('dana', 'DANA', 'ewallet'),
    ],
  };
}

const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });
let calls; // argumen query untuk diperiksa

const models = {
  storeSetting: {
    findFirst: async (args) => {
      calls.storeSetting = args;
      if (failWith) throw failWith;
      return tables.storeSetting ? pick(tables.storeSetting, args.select) : null;
    },
  },
  operatingHour: {
    findMany: async (args) => {
      calls.operatingHour = args;
      return [...tables.operatingHours].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((r) => ({ ...r }));
    },
  },
  paymentMethod: {
    findMany: async (args) => {
      calls.paymentMethod = args;
      return [...tables.paymentMethods]
        .sort((a, b) => GROUP_ORDER.indexOf(a.methodGroup) - GROUP_ORDER.indexOf(b.methodGroup) || a.name.localeCompare(b.name))
        .map((r) => ({ ...r }));
    },
  },
};

// Snapshot baca: penjaga Prisma global + klien tx yang mencatat query, mendeteksi query tumpang tindih & locking read
let txCalls;
let queryLog;
let globalCalls;
let inFlight = 0;
let overlapped = false;
const txClient = {
  ...Object.fromEntries(Object.entries(models).map(([model, fns]) => [model, Object.fromEntries(
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
  )])),
  $queryRaw: async () => { queryLog.push('$queryRaw'); throw new Error('locking read / SQL mentah tidak boleh dipakai GET'); },
  $executeRaw: async () => { queryLog.push('$executeRaw'); throw new Error('GET tidak boleh menulis'); },
};
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
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/settings`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  tables = seed();
  failWith = null;
  calls = {};
  txCalls = [];
  queryLog = [];
  globalCalls = [];
  overlapped = false;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const request = async (path = '', { token = tokenFor('4'), method = 'GET', body } = {}) => {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};

test('hanya Owner: tamu 401, token rusak & Owner nonaktif SESSION_INVALID, pelanggan & Staf 403; tanpa transaksi', async () => {
  assert.equal((await request('', { token: null })).status, 401);
  assert.equal((await request('', { token: 'token-palsu' })).json.code, 'SESSION_INVALID');
  const inactive = await request('', { token: tokenFor('5') });
  assert.deepEqual([inactive.status, inactive.json.code], [401, 'SESSION_INVALID']);
  assert.equal((await request('', { token: tokenFor('1') })).status, 403);
  assert.equal((await request('', { token: tokenFor('3') })).status, 403);
  assert.deepEqual(txCalls, []);
  assert.deepEqual(queryLog, []);
  assert.equal((await request()).status, 200);
});

test('kontrak = mock buildSettingsBoard: profil 6 field, jam urut hari (tutup → null), metode per kelompok', async () => {
  const { status, json } = await request();
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.deepEqual(Object.keys(json.data).sort(), ['hours', 'paymentMethods', 'profile']);
  assert.deepEqual(json.data.profile, {
    store_name: 'Oven & Co.', address: 'Jl. Oven & Co. No. 1, Jakarta', whatsapp_number: '+620000000000',
    preorder_cutoff_time: '17:00', delivery_radius_km: 10, delivery_fee_per_km: 2500,
  });
  assert.deepEqual(json.data.hours.map((h) => h.day_of_week), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(json.data.hours[5], { hour_id: 6, day_of_week: 6, open_time: '08:30', close_time: '20:00', is_open: true });
  assert.deepEqual(json.data.hours[6], { hour_id: 7, day_of_week: 7, open_time: null, close_time: null, is_open: false });
  assert.deepEqual(json.data.paymentMethods.map((m) => m.method_code), ['qris', 'dana', 'gopay', 'ovo', 'va_bca', 'pay_at_store']);
  assert.deepEqual(json.data.paymentMethods[3], { method_code: 'ovo', name: 'OVO', method_group: 'ewallet', is_active: false }); // nonaktif ikut tampil
});

test('tanpa data di luar kontrak: koordinat, loyalty, batas waktu bayar, bonus ulasan tidak dibaca maupun dikirim', async () => {
  const { json } = await request();
  const body = JSON.stringify(json);
  for (const key of ['latitude', 'longitude', 'setting_id', 'payment_timeout_minutes', 'earn_amount_per_point', 'redeem_value', 'review_bonus_points',
    'gold_min_points', 'password', 'password_hash', 'settingId', 'storeName']) {
    assert.ok(!body.includes(`"${key}"`), key);
  }
  assert.ok(!body.includes('106.8') && !body.includes('-6.2'), 'nilai koordinat tidak bocor');
  assert.deepEqual(Object.keys(calls.storeSetting.select).sort(),
    ['address', 'deliveryFeePerKm', 'deliveryRadiusKm', 'preorderCutoffTime', 'storeName', 'whatsappNumber']);
});

test('snapshot baca: satu transaksi REPEATABLE READ, query berurutan lewat tx, tanpa locking read, tulis, atau Prisma global', async () => {
  assert.equal((await request()).status, 200);
  assert.equal(txCalls.length, 1);
  assert.equal(txCalls[0].isolationLevel, 'RepeatableRead');
  assert.deepEqual(queryLog, ['storeSetting.findFirst', 'operatingHour.findMany', 'paymentMethod.findMany']);
  assert.deepEqual(globalCalls, []);
  assert.equal(overlapped, false);
  assert.deepEqual(calls.storeSetting.orderBy, { settingId: 'asc' });
  assert.deepEqual(calls.operatingHour.orderBy, { dayOfWeek: 'asc' });
  assert.deepEqual(calls.paymentMethod.orderBy, [{ methodGroup: 'asc' }, { name: 'asc' }]);
  assert.equal(calls.paymentMethod.where, undefined); // semua metode, termasuk nonaktif (sakelar AD-11)
});

test('baris store_settings tidak ada / kegagalan DB → 500 pesan umum tanpa detail internal', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    tables.storeSetting = null;
    const missing = await request();
    assert.deepEqual([missing.status, missing.json.message], [500, 'Terjadi kesalahan pada server.']);
    assert.deepEqual(queryLog, ['storeSetting.findFirst']); // berhenti sebelum query lain

    tables = seed();
    failWith = Object.assign(new Error("Can't reach database server at db:3306"), { code: 'P1001' });
    const down = await request();
    assert.equal(down.status, 500);
    assert.deepEqual(Object.keys(down.json).sort(), ['message', 'status']);
    assert.ok(!JSON.stringify(down.json).includes('3306'));
  } finally {
    console.error = original;
  }
});

test('nilai opsional kosong & tabel jam kosong tetap dilayani (form AD-11 mengisi default)', async () => {
  Object.assign(tables.storeSetting, { address: null, whatsappNumber: null, preorderCutoffTime: null, deliveryRadiusKm: null, deliveryFeePerKm: null });
  tables.operatingHours = [];
  const { status, json } = await request();
  assert.equal(status, 200);
  assert.deepEqual(json.data.profile, {
    store_name: 'Oven & Co.', address: null, whatsapp_number: null, preorder_cutoff_time: null, delivery_radius_km: null, delivery_fee_per_km: null,
  });
  assert.deepEqual(json.data.hours, []);
});

test('L1: data lama — hari tutup yang masih menyimpan jam di DB dikirim dengan jam null; DB tidak berubah', async () => {
  // Minggu & Rabu ditandai tutup tetapi kolom jamnya masih terisi (data sebelum aturan "hari tutup = jam null")
  for (const day of [3, 7]) Object.assign(tables.operatingHours.find((h) => h.dayOfWeek === day), { openTime: time('07:00'), closeTime: time('20:00'), isOpen: false });
  const before = structuredClone(tables.operatingHours);
  const { status, json } = await request();
  assert.equal(status, 200);
  for (const day of [3, 7]) {
    assert.deepEqual(json.data.hours.find((h) => h.day_of_week === day), { hour_id: day, day_of_week: day, open_time: null, close_time: null, is_open: false });
  }
  assert.deepEqual(json.data.hours.find((h) => h.day_of_week === 1), { hour_id: 1, day_of_week: 1, open_time: '07:00', close_time: '20:00', is_open: true });
  assert.ok(json.data.hours.filter((h) => !h.is_open).every((h) => h.open_time === null && h.close_time === null));
  assert.deepEqual(tables.operatingHours, before); // hanya respons yang dinormalisasi
  assert.deepEqual(queryLog, ['storeSetting.findFirst', 'operatingHour.findMany', 'paymentMethod.findMany']); // tanpa tulis
});

test('C1 hanya GET: metode tulis & sub-rute belum ada → 404 tanpa query; Staf tetap 403', async () => {
  for (const [path, method] of [['', 'PUT'], ['', 'POST'], ['/operating-hours', 'PUT'], ['/lainnya', 'GET']]) {
    const res = await request(path, { method, body: method === 'GET' ? undefined : { store_name: 'X' } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.equal((await request('', { method: 'PUT', token: tokenFor('3'), body: {} })).status, 403);
  assert.deepEqual(queryLog, []);
  assert.deepEqual(txCalls, []);
});
