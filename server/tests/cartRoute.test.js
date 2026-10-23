// Regresi tingkat HTTP: POST /api/cart (validasi, optionalAuth, peran) — audit Step 6.3 · C-3, C-7
// Prisma dipalsukan; server Express dijalankan di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = { 1: { userId: 1n, role: 'customer', isActive: true }, 2: { userId: 2n, role: 'staf', isActive: true } };

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.storeSetting = { findFirst: async () => ({ preorderCutoffTime: null }) };
fakePrisma.product = { findMany: async () => [] };
fakePrisma.customCakeDesign = { findMany: async () => [] };

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/cart`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

const post = (body, token) =>
  fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

test('tamu boleh menghitung keranjang', async () => {
  const res = await post({ items: [{ product_id: '1', quantity: 1 }] });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.lines[0].unavailable_reason, 'product_unavailable');
});

test('lebih dari 100 item (batas keras) → 400; 51 item → 200 dengan exceeds_line_limit', async () => {
  const many = (n) => Array.from({ length: n }, () => ({ product_id: '1', quantity: 1 }));

  assert.equal((await post({ items: many(101) })).status, 400);

  const res = await post({ items: many(51) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.exceeds_line_limit, true);
});

test('regresi gabung keranjang: quantity 110 → 200 (baris ditandai, bukan seluruh keranjang gagal)', async () => {
  const res = await post({ items: [{ product_id: '1', quantity: 110 }] });
  assert.equal(res.status, 200);
});

test('tanggal tidak valid → 400', async () => {
  const res = await post({ items: [{ product_id: '1', quantity: 1, preferred_date: '2026-99-99' }] });
  assert.equal(res.status, 400);
});

test('token tidak valid → 401 (tidak diam-diam menjadi tamu)', async () => {
  const res = await post({ items: [] }, 'token-palsu');
  assert.equal(res.status, 401);
});

test('pelanggan login → 200; staf → 403', async () => {
  assert.equal((await post({ items: [] }, tokenFor('1'))).status, 200);
  assert.equal((await post({ items: [] }, tokenFor('2'))).status, 403);
});

test('regresi M1: token kedaluwarsa → 401 dengan code SESSION_INVALID; tanpa token tetap dilayani sebagai tamu', async () => {
  const expired = jwt.sign(
    { sub: '1', exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' }
  );

  const res = await post({ items: [] }, expired);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'SESSION_INVALID');

  // Fallback tamu yang dilakukan frontend: ulangi tanpa token → 200
  assert.equal((await post({ items: [] })).status, 200);
});

test('M1: akun nonaktif juga SESSION_INVALID; 403 (peran salah) TIDAK memakai kode sesi', async () => {
  users[3] = { userId: 3n, role: 'customer', isActive: false };
  const inactive = await post({ items: [] }, tokenFor('3'));
  assert.equal(inactive.status, 401);
  assert.equal((await inactive.json()).code, 'SESSION_INVALID');

  const staff = await post({ items: [] }, tokenFor('2'));
  assert.equal(staff.status, 403);
  assert.equal((await staff.json()).code, undefined);
});

test('regresi L2: JSON rusak → 400 dengan pesan Indonesia', async () => {
  const res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak' });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { status: 'error', message: 'Format data JSON tidak valid.' });
});

test('re-review C: errorHandler hanya mengirim kode aplikasi untuk 4xx, tidak pernah untuk 500', () => {
  const errorHandler = require('../src/middlewares/errorHandler');
  const response = () => {
    const res = { headersSent: false };
    res.status = (code) => Object.assign(res, { statusCode: code });
    res.json = (body) => Object.assign(res, { body });
    return res;
  };

  const invalid = response();
  errorHandler(Object.assign(new Error('ID produk tidak valid.'), { statusCode: 400, apiCode: 'INVALID_ID' }), {}, invalid);
  assert.deepEqual(invalid.body, { status: 'error', code: 'INVALID_ID', message: 'ID produk tidak valid.' });

  const original = console.error;
  console.error = () => {};
  const crash = response();
  errorHandler(Object.assign(new Error('P2002 detail'), { code: 'P2002', apiCode: 'INVALID_ID' }), {}, crash);
  console.error = original;
  assert.deepEqual(crash.body, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});
