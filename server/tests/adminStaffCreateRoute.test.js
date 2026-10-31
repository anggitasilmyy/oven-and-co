// Regresi tingkat HTTP Step 6.4.10 C3b: POST /api/admin/staff (FR-36 · FR-26 · UC-30 · A-11 · AD-11 "Tambah akun").
// Hanya Owner aktif; validasi registrasi server (pesan & fieldErrors mock) sebelum query; email/HP unik terhadap SEMUA
// pengguna (termasuk pelanggan; email tanpa beda huruf); bcrypt cost 12 di luar kunci; UNIQUE DB = otoritas terakhir —
// P2002 email/phone → 400 fieldErrors, P2002 constraint lain → 500; field di luar kontrak tidak tertulis; respons &
// log tanpa kata sandi/hash/google_id; akun baru bisa login lewat /api/auth/login.
// Fake: tests/helpers/settingsDb.js dengan tabel users (UNIQUE seperti MySQL).

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installSettingsDb } = require('./helpers/settingsDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const SEED_HASH = '$2b$12$hashSeedYangTidakBolehBocor0000000000000000000000000000';
const user = (userId, name, role, extra = {}) => ({
  userId: BigInt(userId), name, email: `u${userId}@demo.com`, phone: `+6281200000${String(userId).padStart(3, '0')}`,
  passwordHash: SEED_HASH, googleId: null, role, isActive: true, createdAt: new Date('2026-01-01T00:00:00.000Z'), ...extra,
});
const userRows = () => [
  user(1, 'Anisa Pelanggan', 'customer', { email: 'anisa@demo.com', phone: '+6281234567890', googleId: 'google-anisa' }),
  user(2, 'Budi Staf', 'staf', { email: 'staf@demo.com', phone: '+6281234567891' }),
  user(3, 'Citra Owner', 'owner', { email: 'owner@demo.com', phone: '+6281234567892' }),
  user(4, 'Dewi Owner Lama', 'owner', { isActive: false }),
  user(5, 'Lama Huruf Besar', 'customer', { email: 'Budi.Lama@Demo.COM', phone: '+6281299990000', isActive: false }),
];
const db = installSettingsDb(fakePrisma, {}, { userRows });

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => db.reset());

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
async function call(path, { method = 'POST', body, token = tokenFor('3') } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const create = (body, token) => call('/admin/staff', { body, token });
const captureErrors = async (fn) => {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(' '));
  try { return { result: await fn(), logged: lines.join('\n') }; } finally { console.error = original; }
};

const PASSWORD = 'RahasiaStaf#2026';
const FORM = { name: '  Eka Staf  ', email: '  Eka.Staf@Demo.COM ', phone: '+62 812-3456 (7899)', password: PASSWORD, role: 'staf' };
const SEED_COUNT = 5;
const newRows = () => db.committed.users.slice(SEED_COUNT);
const assertNoUserWrite = () => {
  assert.equal(db.committed.users.length, SEED_COUNT);
  assert.deepEqual(db.committed.users, userRows());
};

test('hanya Owner aktif: tamu 401, pelanggan & Staf 403, Owner nonaktif 401; tanpa query & tanpa tulis', async () => {
  assert.equal((await create(FORM, null)).status, 401);
  assert.equal((await create(FORM, tokenFor('1'))).status, 403);
  assert.equal((await create(FORM, tokenFor('2'))).status, 403);
  const inactive = await create(FORM, tokenFor('4'));
  assert.deepEqual([inactive.status, inactive.json.code], [401, 'SESSION_INVALID']);
  assert.deepEqual([db.userQueries, db.userWrites], [[], []]);
  assertNoUserWrite();
});

test('membuat akun Staf: 201, normalisasi email & HP, kontrak toAdminAccount, hash bcrypt cost 12 (bukan teks asli)', async () => {
  const { status, json } = await create(FORM);
  assert.equal(status, 201);
  assert.equal(json.status, 'success');
  const account = json.data;
  assert.deepEqual(Object.keys(account).sort(), ['created_at', 'email', 'is_active', 'name', 'phone', 'role', 'user_id']);
  assert.deepEqual(
    [account.user_id, account.name, account.email, account.phone, account.role, account.is_active],
    ['6', 'Eka Staf', 'eka.staf@demo.com', '+6281234567899', 'staf', true],
  );
  assert.ok(!Number.isNaN(Date.parse(account.created_at)));

  const [saved] = newRows();
  assert.deepEqual([saved.email, saved.phone, saved.role, saved.isActive, saved.googleId], ['eka.staf@demo.com', '+6281234567899', 'staf', true, null]);
  assert.notEqual(saved.passwordHash, PASSWORD);
  assert.ok(!saved.passwordHash.includes(PASSWORD));
  assert.equal(bcrypt.getRounds(saved.passwordHash), 12);
  assert.equal(await bcrypt.compare(PASSWORD, saved.passwordHash), true);
  assert.equal(await bcrypt.compare('salah-sandi', saved.passwordHash), false);
});

test('membuat akun Owner: 201 role owner, langsung tampil di GET (urutan Owner dulu)', async () => {
  const { status, json } = await create({ ...FORM, name: 'Fajar Owner', email: 'fajar@demo.com', phone: '+6281311112222', role: 'owner' });
  assert.deepEqual([status, json.data.role, json.data.is_active], [201, 'owner', true]);
  const list = await call('/admin/staff', { method: 'GET' });
  assert.deepEqual(list.json.data.map((a) => a.name), ['Citra Owner', 'Dewi Owner Lama', 'Fajar Owner', 'Budi Staf']);
});

test('email duplikat dengan Staf, Owner, maupun Pelanggan (tanpa beda huruf) → 400 fieldErrors.email; tanpa tulis', async () => {
  for (const email of ['staf@demo.com', 'OWNER@demo.com', 'anisa@demo.com', 'budi.lama@demo.com', ' Anisa@Demo.com ']) {
    db.reset();
    const { status, json } = await create({ ...FORM, email });
    assert.deepEqual([status, json.message, json.fieldErrors], [400, 'Email sudah terdaftar', { email: 'Email sudah terdaftar' }], email);
    assert.deepEqual(db.userWrites, [], email);
    assertNoUserWrite();
  }
});

test('HP duplikat dengan semua peran (setelah normalisasi seperti registrasi) → 400 fieldErrors.phone; email & HP sekaligus', async () => {
  for (const phone of ['+6281234567891', '+62 812 3456 7892', '+62 (812) 3456-7890', '+6281299990000']) {
    db.reset();
    const { status, json } = await create({ ...FORM, phone });
    assert.deepEqual([status, json.fieldErrors], [400, { phone: 'Nomor HP sudah terdaftar' }], phone);
    assertNoUserWrite();
  }
  db.reset();
  const both = await create({ ...FORM, email: 'staf@demo.com', phone: '+6281234567890' });
  assert.deepEqual([both.status, both.json.message, both.json.fieldErrors],
    [400, 'Email sudah terdaftar', { email: 'Email sudah terdaftar', phone: 'Nomor HP sudah terdaftar' }]);
  // Cek unik mencakup seluruh tabel users (tanpa filter peran / status)
  const [query] = db.userQueries;
  assert.deepEqual(query.where, { OR: [{ email: 'staf@demo.com' }, { phone: '+6281234567890' }] });
  assert.deepEqual(query.select, { email: true, phone: true });
});

test('validasi gagal → 400 fieldErrors (pesan mock), tanpa query, tanpa hash, tanpa tulis', async () => {
  const { status, json } = await create({ name: ' ', email: 'bukan-email', phone: '0812345678', password: 'pendek', role: 'customer' });
  assert.equal(status, 400);
  assert.equal(json.message, 'Nama wajib diisi');
  assert.deepEqual(json.fieldErrors, {
    name: 'Nama wajib diisi', email: 'Format email tidak valid', phone: 'Nomor HP harus diawali +62',
    password: 'Kata sandi minimal 8 karakter', role: 'Pilih peran akun',
  });
  for (const body of [{ ...FORM, phone: '+628123456' }, { ...FORM, password: 'é'.repeat(37) }, { ...FORM, role: 'admin' }, { ...FORM, name: 'x'.repeat(101) }]) {
    assert.equal((await create(body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  for (const body of [{ ...FORM, password: 12345678 }, { ...FORM, role: ['staf'] }, [], '{rusak']) {
    const res = await create(body);
    assert.deepEqual([res.status, res.json.fieldErrors], [400, undefined]); // bentuk salah: tanpa fieldErrors
  }
  assert.deepEqual([db.userQueries, db.userWrites], [[], []]);
  assertNoUserWrite();
});

test('field di luar kontrak tidak bisa menyisipkan is_active, google_id, user_id, password_hash, created_at', async () => {
  const { status, json } = await create({
    ...FORM, is_active: false, isActive: false, google_id: 'google-sisipan', googleId: 'google-sisipan', user_id: '99', userId: 99,
    password_hash: '$2b$04$hashSisipan', passwordHash: '$2b$04$hashSisipan', created_at: '2000-01-01T00:00:00.000Z',
  });
  assert.equal(status, 201);
  assert.deepEqual([json.data.user_id, json.data.is_active], ['6', true]);
  const [write] = db.userWrites;
  assert.deepEqual(Object.keys(write.data).sort(), ['email', 'isActive', 'name', 'passwordHash', 'phone', 'role']);
  const [saved] = newRows();
  assert.deepEqual([saved.userId, saved.isActive, saved.googleId], [6n, true, null]);
  assert.notEqual(saved.passwordHash, '$2b$04$hashSisipan');
  assert.equal(await bcrypt.compare(PASSWORD, saved.passwordHash), true);
  assert.ok(saved.createdAt.getFullYear() >= 2026);
});

test('respons & argumen Prisma tanpa data sensitif: tidak ada kata sandi asli, hash, atau google_id; select whitelist', async () => {
  const { json } = await create(FORM);
  const body = JSON.stringify(json).toLowerCase();
  for (const leaked of [PASSWORD.toLowerCase(), 'password', 'hash', 'google', '$2b$']) assert.ok(!body.includes(leaked), leaked);
  const [write] = db.userWrites;
  assert.ok(!JSON.stringify(write).includes(PASSWORD), 'kata sandi asli tidak diteruskan ke Prisma');
  assert.deepEqual(Object.keys(write.select).sort(), ['createdAt', 'email', 'isActive', 'name', 'phone', 'role', 'userId']);
  assert.equal(db.transactions.length, 0); // tanpa transaksi & tanpa kunci store_settings (keputusan C3 D1)
  assert.equal(db.lockWaits, 0);
});

test('dua request bersamaan, email sama → satu 201, satu 400 fieldErrors.email (P2002 users_email_key); satu baris', async () => {
  const [a, b] = await Promise.all([
    create({ ...FORM, phone: '+6281311110001' }),
    create({ ...FORM, phone: '+6281311110002', name: 'Eka Kedua' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 400]);
  const loser = a.status === 400 ? a : b;
  assert.deepEqual([loser.json.message, loser.json.fieldErrors], ['Email sudah terdaftar', { email: 'Email sudah terdaftar' }]);
  assert.equal(db.userQueries.length, 2); // keduanya lolos cek awal → otoritas = UNIQUE database
  assert.equal(db.userWrites.length, 2);
  assert.equal(newRows().filter((u) => u.email === 'eka.staf@demo.com').length, 1);
});

test('dua request bersamaan, HP sama (format berbeda) → satu 201, satu 400 fieldErrors.phone (P2002 users_phone_key)', async () => {
  const [a, b] = await Promise.all([
    create({ ...FORM, email: 'satu@demo.com', phone: '+6281377778888' }),
    create({ ...FORM, email: 'dua@demo.com', phone: '+62 813-7777-8888' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 400]);
  assert.deepEqual((a.status === 400 ? a : b).json.fieldErrors, { phone: 'Nomor HP sudah terdaftar' });
  assert.equal(newRows().length, 1);
});

test('P2002 constraint lain (google_id, PRIMARY, target tak dikenal) → 500 umum, bukan kesalahan input; log tanpa kata sandi', async () => {
  for (const target of ['users_google_id_key', 'PRIMARY', ['google_id'], undefined, 'users_email_phone_key']) {
    db.reset();
    db.failOn = (op) => (op === 'user.create'
      ? Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: target === undefined ? undefined : { target } })
      : false);
    const { result, logged } = await captureErrors(() => create(FORM));
    assert.deepEqual([result.status, result.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }], String(target));
    assert.ok(!logged.includes(PASSWORD), 'kata sandi asli tidak tercatat di log');
    assertNoUserWrite();
  }
  // Bentuk array nama field (driver lain) tetap dikenali untuk email/phone
  db.reset();
  db.failOn = (op) => (op === 'user.create' ? Object.assign(new Error('Unique'), { code: 'P2002', meta: { target: ['phone'] } }) : false);
  const res = await create(FORM);
  assert.deepEqual([res.status, res.json.fieldErrors], [400, { phone: 'Nomor HP sudah terdaftar' }]);
});

test('akun baru bisa login lewat /api/auth/login (email & HP), lalu langsung bisa memakai Admin sesuai peran', async () => {
  assert.equal((await create({ ...FORM, role: 'owner' })).status, 201);
  for (const identifier of ['eka.staf@demo.com', 'EKA.STAF@demo.com', '+62 812 3456 7899']) {
    const login = await call('/auth/login', { body: { identifier, password: PASSWORD }, token: null });
    assert.equal(login.status, 200, identifier);
    assert.deepEqual([login.json.data.user.role, login.json.data.user.isActive], ['owner', true]);
    assert.ok(!JSON.stringify(login.json).includes('$2b$'));
    assert.equal((await call('/admin/staff', { method: 'GET', token: login.json.data.token })).status, 200);
  }
  const wrong = await call('/auth/login', { body: { identifier: 'eka.staf@demo.com', password: 'salah-sandi' }, token: null });
  assert.equal(wrong.status, 401);
});
