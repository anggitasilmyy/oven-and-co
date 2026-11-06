// Regresi tingkat HTTP Step 6.4.10 C3a: GET /api/admin/staff (FR-36 · FR-26 · UC-30 · A-11 · AD-11 tabel "Akun staf").
// Hanya Owner; akun Owner & Staf termasuk yang nonaktif; akun pelanggan tidak ikut; urutan mock (peran → nama → id);
// password_hash & google_id tidak dibaca (select whitelist) maupun dikirim; satu query tanpa transaksi (keputusan C3 D3).
// Fake: tests/helpers/settingsDb.js dengan tabel users (opsi userRows).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installSettingsDb } = require('./helpers/settingsDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const HASH = '$2b$12$INIhashRahasiaYangTidakBolehBocor000000000000000000000';
const user = (userId, name, role, extra = {}) => ({
  userId: BigInt(userId), name, email: `u${userId}@demo.com`, phone: `+62812000000${String(userId).padStart(2, '0')}`,
  passwordHash: HASH, googleId: `google-${userId}-rahasia`, role, isActive: true,
  createdAt: new Date(`2026-0${(userId % 9) + 1}-01T08:00:00.000Z`), ...extra,
});
const userRows = () => [
  user(1, 'Anisa Pelanggan', 'customer'),
  user(2, 'Budi Staf', 'staf', { googleId: null }),
  user(3, 'Citra Owner', 'owner'),
  user(4, 'Andi Staf', 'staf', { isActive: false }), // nonaktif tetap tampil
  user(5, 'Dewi Owner', 'owner', { isActive: false }),
  user(6, 'Andi Staf', 'staf'), // nama sama → urut id
  user(7, 'Andi Pelanggan', 'customer', { isActive: false }),
  user(12, 'Budi Staf', 'staf', { passwordHash: null }), // hanya login Google
];
const db = installSettingsDb(fakePrisma, {}, { userRows });

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/staff`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => db.reset());

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
async function request(path = '', { token = tokenFor('3'), method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('hanya Owner aktif: tamu 401, token rusak & Owner nonaktif SESSION_INVALID, pelanggan & Staf 403; tanpa query akun', async () => {
  assert.equal((await request('', { token: null })).status, 401);
  assert.equal((await request('', { token: 'token-palsu' })).json.code, 'SESSION_INVALID');
  const inactiveOwner = await request('', { token: tokenFor('5') });
  assert.deepEqual([inactiveOwner.status, inactiveOwner.json.code], [401, 'SESSION_INVALID']);
  assert.equal((await request('', { token: tokenFor('1') })).status, 403);
  assert.equal((await request('', { token: tokenFor('2') })).status, 403);
  assert.deepEqual(db.userQueries, []);
  assert.equal((await request()).status, 200);
});

test('kontrak mock: hanya Owner & Staf (termasuk nonaktif), urut peran → nama → id; bentuk akun persis', async () => {
  const { status, json } = await request();
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.deepEqual(json.data.map((a) => [a.user_id, a.role, a.name, a.is_active]), [
    ['3', 'owner', 'Citra Owner', true],
    ['5', 'owner', 'Dewi Owner', false],
    ['4', 'staf', 'Andi Staf', false],
    ['6', 'staf', 'Andi Staf', true],
    ['2', 'staf', 'Budi Staf', true],
    ['12', 'staf', 'Budi Staf', true], // id numerik 12 setelah 2 (bukan urutan teks)
  ]);
  assert.deepEqual(json.data[0], {
    user_id: '3', name: 'Citra Owner', email: 'u3@demo.com', phone: '+6281200000003', role: 'owner', is_active: true,
    created_at: '2026-04-01T08:00:00.000Z',
  });
  for (const account of json.data) {
    assert.deepEqual(Object.keys(account).sort(), ['created_at', 'email', 'is_active', 'name', 'phone', 'role', 'user_id']);
    assert.equal(typeof account.user_id, 'string');
  }
});

test('akun pelanggan tidak ikut (aktif maupun nonaktif), disaring di query — bukan setelah membaca', async () => {
  const { json } = await request();
  assert.ok(json.data.every((a) => a.role !== 'customer'));
  assert.ok(!json.data.some((a) => ['1', '7'].includes(a.user_id)));
  assert.equal(db.userQueries.length, 1);
  assert.deepEqual(db.userQueries[0].where, { role: { in: ['staf', 'owner'] } });
});

test('tanpa data sensitif: password_hash & google_id tidak dibaca (select whitelist) maupun dikirim', async () => {
  const { json } = await request();
  const body = JSON.stringify(json);
  for (const leaked of ['password', 'hash', 'google', HASH, 'rahasia', 'passwordHash', 'googleId']) {
    assert.ok(!body.toLowerCase().includes(leaked.toLowerCase()), leaked);
  }
  const [query] = db.userQueries;
  assert.deepEqual(Object.keys(query.select).sort(), ['createdAt', 'email', 'isActive', 'name', 'phone', 'role', 'userId']);
  assert.ok(Object.values(query.select).every((v) => v === true));
});

test('satu query tanpa transaksi, kunci, atau tulis; kegagalan DB → 500 umum tanpa detail', async () => {
  assert.equal((await request()).status, 200);
  assert.equal(db.transactions.length, 0);
  assert.deepEqual(db.globalCalls, []);
  assert.deepEqual(db.violations, []);
  assert.equal(db.lockWaits, 0);

  db.failOn = (op) => op === 'user.findMany';
  const original = console.error;
  console.error = () => {};
  try {
    const res = await request();
    assert.deepEqual([res.status, res.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
  } finally {
    console.error = original;
  }
});

test('penonaktifan di DB langsung berlaku: Owner yang dinonaktifkan → 401 di request berikutnya', async () => {
  assert.equal((await request()).status, 200);
  db.committed.users.find((u) => u.userId === 3n).isActive = false;
  const res = await request();
  assert.deepEqual([res.status, res.json.code], [401, 'SESSION_INVALID']);
});

// Batas cakupan C3: POST (adminStaffCreateRoute.test.js) & PATCH /:id/active (adminStaffStatusRoute.test.js) ada; hapus
// akun, ubah peran, ubah data akun, dan sub-rute lain tidak ada → 404 (keputusan audit AD-11 no. 7).
test('batas cakupan: hapus akun, ubah peran/data akun, sub-rute lain → 404 tanpa query; Staf tetap 403', async () => {
  for (const [path, method] of [['/2', 'GET'], ['/2', 'PUT'], ['/2', 'PATCH'], ['/2', 'DELETE'], ['', 'DELETE'], ['/2/role', 'PATCH'], ['/2/active', 'PUT']]) {
    const res = await request(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : { is_active: false } });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.equal((await request('', { method: 'POST', token: tokenFor('2'), body: {} })).status, 403);
  assert.deepEqual(db.userQueries, []);
  assert.equal(db.transactions.length, 0);
});
