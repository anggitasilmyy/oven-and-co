// Regresi tingkat HTTP: /api/me/profile & /api/me/password (FR-24 · UC-16 · C-20 Ubah Profil) — auth, peran,
// bentuk respons (publicUser, sama dengan sesi login), field sensitif & user_id palsu, validasi, keunikan email/HP,
// verifikasi kata sandi saat ini, hashing bcrypt, kata sandi tidak bocor, dan error database.
// Prisma dipalsukan (tabel users di memori); hash bcrypt ASLI. Server Express di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const OLD_PASSWORD = 'demo1234';
const LONG_PASSWORD = 'a'.repeat(72); // tepat batas bcrypt
// Hash fixture memakai cost 4 agar tes cepat; hash baru dari service harus cost 12
const hashes = {};

const baseUsers = () => [
  { userId: 1n, name: 'Anisa Pelanggan', email: 'pelanggan@demo.com', phone: '+6281234567890', passwordHash: hashes.old, googleId: null, role: 'customer', isActive: true, createdAt: new Date('2024-01-15T08:00:00Z') },
  { userId: 2n, name: 'Budi Pelanggan', email: 'budi@demo.com', phone: '+6281234567899', passwordHash: hashes.old, googleId: null, role: 'customer', isActive: true, createdAt: new Date('2024-02-01T08:00:00Z') },
  { userId: 3n, name: 'Staf', email: 'staf@demo.com', phone: '+6281234567891', passwordHash: hashes.old, googleId: null, role: 'staf', isActive: true, createdAt: new Date('2024-03-01T08:00:00Z') },
  { userId: 4n, name: 'Owner', email: 'owner@demo.com', phone: '+6281234567892', passwordHash: hashes.old, googleId: null, role: 'owner', isActive: true, createdAt: new Date('2024-03-01T08:00:00Z') },
  { userId: 5n, name: 'Nonaktif', email: 'off@demo.com', phone: '+6281234567893', passwordHash: hashes.old, googleId: null, role: 'customer', isActive: false, createdAt: new Date('2024-03-01T08:00:00Z') },
  { userId: 6n, name: 'Google Saja', email: 'google@demo.com', phone: '+6281234567894', passwordHash: null, googleId: 'g-6', role: 'customer', isActive: true, createdAt: new Date('2024-03-01T08:00:00Z') },
  { userId: 7n, name: 'Sandi Panjang', email: 'long@demo.com', phone: '+6281234567895', passwordHash: hashes.long, googleId: null, role: 'customer', isActive: true, createdAt: new Date('2024-03-01T08:00:00Z') },
];

let users;
let failOn;

const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });
const maybeFail = (op) => {
  if (failOn === op) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
  if (failOn === `${op}:P2002`) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
};

fakePrisma.user = {
  // Middleware auth & service memakai findUnique — kegagalan service diuji lewat select yang berbeda
  findUnique: async ({ where, select }) => {
    if (select?.passwordHash || select?.email) maybeFail('findUnique');
    const row = users.find((u) => u.userId === where.userId);
    return row ? pick(row, select) : null;
  },
  findMany: async ({ where, select }) => {
    maybeFail('findMany');
    return users.filter((u) => matchesWhere(u, where)).map((u) => pick(u, select));
  },
  update: async ({ where, data, select }) => {
    maybeFail('update');
    const row = users.find((u) => u.userId === where.userId);
    if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    Object.assign(row, data);
    return pick(row, select);
  },
  updateMany: async ({ where, data }) => {
    maybeFail('updateMany');
    // Request lain sudah mengganti hash setelah verifikasi request ini → `where` lama tidak cocok lagi
    if (failOn === 'updateMany:stale') users.find((u) => u.userId === where.userId).passwordHash = hashes.concurrent;
    const rows = users.filter((u) => matchesWhere(u, where));
    rows.forEach((row) => Object.assign(row, data));
    return { count: rows.length };
  },
};

let server;
let baseUrl;

test.before(async () => {
  hashes.old = await bcrypt.hash(OLD_PASSWORD, 4);
  hashes.long = await bcrypt.hash(LONG_PASSWORD, 4);
  hashes.concurrent = await bcrypt.hash('diubahRequestLain', 4);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  users = baseUsers();
  failOn = null;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path, token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text), text };
};

const userById = (id) => users.find((u) => u.userId === BigInt(id));
const snapshot = () => JSON.stringify(users, (key, value) => (typeof value === 'bigint' ? String(value) : value));
const validProfile = (overrides = {}) => ({
  name: '  Anisa Baru ', email: ' Anisa.Baru@Demo.COM ', phone: '+62 812-3456-7000', ...overrides,
});
const passwordBody = (overrides = {}) => ({ currentPassword: OLD_PASSWORD, newPassword: 'sandiBaru99', ...overrides });

const PUBLIC_KEYS = ['createdAt', 'email', 'isActive', 'name', 'phone', 'role', 'userId'];

const ENDPOINTS = [
  ['GET', '/profile'], ['PATCH', '/profile'], ['PUT', '/profile'], ['PATCH', '/password'], ['PUT', '/password'],
];
const bodyFor = (path) => (path === '/profile' ? validProfile() : passwordBody());

test('tamu (tanpa token) → 401 di semua endpoint profil & kata sandi, bukan 404', async () => {
  for (const [method, path] of ENDPOINTS) {
    const { status, json } = await call(method, path, null, method === 'GET' ? undefined : bodyFor(path));
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }
});

test('token rusak, kedaluwarsa, salah secret, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const wrongSecret = jwt.sign({ sub: '1' }, 'secret-lain', { algorithm: 'HS256' });
  const before = snapshot();

  for (const [method, path] of ENDPOINTS) {
    for (const token of ['token-palsu', expired, wrongSecret, tokenFor('5')]) {
      const { status, json } = await call(method, path, token, method === 'GET' ? undefined : bodyFor(path));
      assert.equal(status, 401, `${method} ${path}`);
      assert.equal(json.code, 'SESSION_INVALID');
    }
  }
  assert.equal(snapshot(), before);
});

test('staf dan owner → 403 tanpa kode sesi, data tidak berubah', async () => {
  const before = snapshot();
  for (const [method, path] of ENDPOINTS) {
    for (const sub of ['3', '4']) {
      const { status, json } = await call(method, path, tokenFor(sub), method === 'GET' ? undefined : bodyFor(path));
      assert.equal(status, 403, `${method} ${path}`);
      assert.equal(json.code, undefined);
    }
  }
  assert.equal(snapshot(), before);
});

test('GET /profile: bentuk publicUser (sama dengan login), tanpa hash kata sandi / google_id', async () => {
  const { status, json, text } = await call('GET', '/profile?userId=2', tokenFor('1'));

  assert.equal(status, 200);
  assert.deepEqual(json, {
    status: 'success',
    data: {
      userId: '1', name: 'Anisa Pelanggan', email: 'pelanggan@demo.com', phone: '+6281234567890',
      role: 'customer', isActive: true, createdAt: '2024-01-15T08:00:00.000Z',
    },
  });
  assert.doesNotMatch(text, /password|\$2[aby]\$|google/i);
});

test('PATCH & PUT /profile: nama/email/HP dinormalisasi; respons publicUser; pelanggan lain tidak tersentuh', async () => {
  for (const method of ['PATCH', 'PUT']) {
    users = baseUsers();
    const { status, json } = await call(method, '/profile', tokenFor('1'), validProfile());

    assert.equal(status, 200, method);
    assert.deepEqual(Object.keys(json.data).sort(), PUBLIC_KEYS);
    assert.deepEqual(
      { name: json.data.name, email: json.data.email, phone: json.data.phone, userId: json.data.userId, role: json.data.role },
      { name: 'Anisa Baru', email: 'anisa.baru@demo.com', phone: '+6281234567000', userId: '1', role: 'customer' }
    );
    assert.equal(userById(1).email, 'anisa.baru@demo.com');
    assert.equal(userById(2).name, 'Budi Pelanggan');
  }
});

test('PATCH /profile: field sensitif & user_id palsu diabaikan — tidak bisa ganti peran, status, sandi, atau akun lain', async () => {
  const oldHash = userById(1).passwordHash;
  const user2Before = JSON.stringify(userById(2), (k, v) => (typeof v === 'bigint' ? String(v) : v));

  const { status, json } = await call('PATCH', '/profile?userId=2', tokenFor('1'), validProfile({
    userId: '2', user_id: 2, role: 'owner', isActive: false, is_active: false, passwordHash: 'x', password_hash: 'x',
    password: 'hack12345', googleId: 'g-hack', createdAt: '2000-01-01T00:00:00Z',
  }));

  assert.equal(status, 200);
  assert.equal(json.data.userId, '1');
  const me = userById(1);
  assert.equal(me.role, 'customer');
  assert.equal(me.isActive, true);
  assert.equal(me.passwordHash, oldHash);
  assert.equal(me.googleId, null);
  assert.equal(me.createdAt.toISOString(), '2024-01-15T08:00:00.000Z');
  assert.equal(JSON.stringify(userById(2), (k, v) => (typeof v === 'bigint' ? String(v) : v)), user2Before);
});

test('PATCH /profile: isian tidak valid → 400 dengan pesan Indonesia, tidak ada yang tersimpan', async () => {
  const cases = [
    [validProfile({ name: '   ' }), 'Nama wajib diisi.'],
    [validProfile({ name: 'x'.repeat(101) }), 'Nama maksimal 100 karakter.'],
    [validProfile({ name: undefined }), 'Nama wajib diisi.'],
    [validProfile({ email: 'bukan-email' }), 'Format email tidak valid.'],
    [validProfile({ email: `${'a'.repeat(142)}@demo.com` }), 'Format email tidak valid.'], // 151 karakter
    [validProfile({ email: '' }), 'Email wajib diisi.'],
    [validProfile({ phone: '081234567890' }), 'Nomor HP harus menggunakan format +62.'],
    [validProfile({ phone: '+621234567' }), 'Nomor HP harus menggunakan format +62.'],
    [validProfile({ phone: 6281234567890 }), 'Nomor HP wajib diisi.'],
    [[], 'Data profil tidak valid.'],
  ];
  const before = snapshot();

  for (const [body, message] of cases) {
    const { status, json } = await call('PATCH', '/profile', tokenFor('1'), body);
    assert.equal(status, 400, message);
    assert.equal(json.message, message);
  }
  assert.equal(snapshot(), before);
});

test('PATCH /profile: email/HP milik akun lain → 409; email & HP sendiri yang tidak berubah → 200', async () => {
  const before = snapshot();

  const email = await call('PATCH', '/profile', tokenFor('1'), validProfile({ email: ' BUDI@demo.com ' }));
  assert.deepEqual([email.status, email.json.message], [409, 'Email sudah terdaftar.']);

  const phone = await call('PATCH', '/profile', tokenFor('1'), validProfile({ phone: '+62 812 3456 7899' }));
  assert.deepEqual([phone.status, phone.json.message], [409, 'Nomor HP sudah terdaftar.']);
  assert.equal(snapshot(), before);

  const same = await call('PATCH', '/profile', tokenFor('1'), { name: 'Anisa', email: 'pelanggan@demo.com', phone: '+6281234567890' });
  assert.equal(same.status, 200);
  assert.equal(userById(1).name, 'Anisa');
});

test('PATCH /profile: email/HP dipakai akun lain di sela pengecekan (P2002) → 409, bukan 500', async () => {
  failOn = 'update:P2002';

  const { status, json } = await call('PATCH', '/profile', tokenFor('1'), validProfile());

  assert.equal(status, 409);
  assert.equal(json.message, 'Email atau nomor HP sudah terdaftar.');
});

test('PATCH & PUT /password: kata sandi baru di-hash bcrypt cost 12; sandi lama tidak berlaku; tidak ada sandi di respons', async () => {
  for (const method of ['PATCH', 'PUT']) {
    users = baseUsers();
    const { status, json, text } = await call(method, '/password', tokenFor('1'), passwordBody());

    assert.equal(status, 200, method);
    assert.deepEqual(json, { status: 'success', data: { message: 'Kata sandi berhasil diubah.' } });
    assert.doesNotMatch(text, /sandiBaru99|demo1234|\$2[aby]\$/);

    const stored = userById(1).passwordHash;
    assert.notEqual(stored, 'sandiBaru99');
    assert.equal(bcrypt.getRounds(stored), 12);
    assert.equal(await bcrypt.compare('sandiBaru99', stored), true);
    assert.equal(await bcrypt.compare(OLD_PASSWORD, stored), false);
    assert.equal(userById(2).passwordHash, hashes.old); // akun lain tidak berubah
  }
});

test('PATCH /password: kata sandi saat ini salah / akun Google tanpa sandi → 400 aman, hash tidak berubah', async () => {
  const before = snapshot();

  for (const [sub, body] of [
    ['1', passwordBody({ currentPassword: 'salah12345' })],
    ['6', passwordBody({ currentPassword: 'apaSaja123' })],
  ]) {
    const { status, json, text } = await call('PATCH', '/password', tokenFor(sub), body);
    assert.equal(status, 400);
    assert.deepEqual(json, { status: 'error', message: 'Kata sandi saat ini salah.' });
    assert.doesNotMatch(text, /salah12345|apaSaja123|sandiBaru99/);
  }
  assert.equal(snapshot(), before);
});

test('PATCH /password: > 72 byte tidak lolos walau 72 byte pertamanya cocok (bcrypt memotong input)', async () => {
  const { status, json } = await call('PATCH', '/password', tokenFor('7'), passwordBody({ currentPassword: `${LONG_PASSWORD}X` }));

  assert.equal(status, 400);
  assert.equal(json.message, 'Kata sandi saat ini salah.');
  assert.equal(userById(7).passwordHash, hashes.long);

  // Sandi 72 byte yang benar tetap bisa dipakai
  assert.equal((await call('PATCH', '/password', tokenFor('7'), passwordBody({ currentPassword: LONG_PASSWORD }))).status, 200);
});

test('PATCH /password: kata sandi baru tidak valid → 400 sesuai aturan registrasi, hash tidak berubah', async () => {
  const cases = [
    [passwordBody({ newPassword: 'pendek' }), 'Kata sandi harus minimal 8 karakter.'],
    [passwordBody({ newPassword: 'é'.repeat(37) }), 'Kata sandi terlalu panjang.'], // 74 byte
    [passwordBody({ newPassword: undefined }), 'Kata sandi harus minimal 8 karakter.'],
    [passwordBody({ newPassword: OLD_PASSWORD }), 'Kata sandi baru harus berbeda dari kata sandi saat ini.'],
    [passwordBody({ currentPassword: '' }), 'Kata sandi saat ini wajib diisi.'],
    [passwordBody({ currentPassword: 12345678 }), 'Kata sandi saat ini wajib diisi.'],
    [[], 'Data kata sandi tidak valid.'],
  ];
  const before = snapshot();

  for (const [body, message] of cases) {
    const { status, json } = await call('PATCH', '/password', tokenFor('1'), body);
    assert.equal(status, 400, message);
    assert.equal(json.message, message);
  }
  assert.equal(snapshot(), before);
});

test('PATCH /password: hash berubah di sela verifikasi (perubahan bersamaan) → 400, tidak menimpa', async () => {
  failOn = 'updateMany:stale';

  const { status, json } = await call('PATCH', '/password', tokenFor('1'), passwordBody());

  assert.equal(status, 400);
  assert.equal(json.message, 'Kata sandi saat ini salah.');
  assert.equal(userById(1).passwordHash, hashes.concurrent); // hasil request lain tidak ditimpa
});

test('error database → 500 pesan umum; kata sandi tidak ikut tercatat di log', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.map(String).join(' ')));

  for (const [op, method, path, body] of [
    ['findUnique', 'GET', '/profile'],
    ['findMany', 'PATCH', '/profile', validProfile()],
    ['findUnique', 'PATCH', '/password', passwordBody()],
    ['updateMany', 'PATCH', '/password', passwordBody()],
  ]) {
    users = baseUsers();
    failOn = op;
    const { status, json } = await call(method, path, tokenFor('1'), body);
    assert.equal(status, 500, `${op} ${method} ${path}`);
    assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
  assert.equal(userById(1).passwordHash, hashes.old);
  assert.ok(logged.length > 0);
  assert.ok(logged.every((line) => !/sandiBaru99|demo1234/.test(line)));
});
