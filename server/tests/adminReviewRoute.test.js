// Regresi tingkat HTTP Step 6.4.8: /api/admin/reviews (FR-35 · UC-25 · BR-11 · AD-10 tab Ulasan). Staf & Owner;
// daftar semua ulasan (termasuk tersembunyi) dengan filter rating & ringkasan, dalam satu snapshot baca REPEATABLE
// READ lewat `tx`; balas (trim, wajib, maks. 500) & sembunyikan/tampilkan lewat UPDATE satu baris di transaksi;
// 404/400 INVALID_ID; kontrak = client mock customerAdmin.js. Prisma dipalsukan — MySQL dibuktikan di uji integrasi.

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
};

let reviews;
let failOn;

function seed() {
  const item = (productId, product, orderNumber, variant = null) => ({ productId: BigInt(productId), product: { name: product }, variant: variant ? { name: variant } : null, order: { orderNumber } });
  const r = (reviewId, rating, createdAt, extra = {}) => ({
    reviewId: BigInt(reviewId), rating, createdAt: new Date(createdAt), tags: null, comment: null, adminReply: null, isHidden: false,
    user: { name: 'Anisa Pelanggan' }, photos: [], orderItem: item(1, 'Classic Butter Croissant', 'OVC-261030-001'), ...extra,
  });
  return [
    r(1, 5, '2026-10-30T03:00:00Z', { tags: 'Lembut, Wangi ,', comment: 'Enak sekali', photos: [{ photoId: 2n, photoUrl: '/uploads/reviews/b.jpg' }, { photoId: 1n, photoUrl: '/uploads/reviews/a.jpg' }] }),
    r(2, 4, '2026-10-31T03:00:00Z', { isHidden: true, adminReply: 'Terima kasih', orderItem: item(2, 'Signature Cinnamon Roll', 'OVC-261031-002', 'Extra Glaze') }),
    r(3, 5, '2026-10-31T03:00:00Z', { user: { name: 'Budi Santoso' } }),
    r(9, 1, '2026-10-01T03:00:00Z', { user: null, orderItem: null }),
  ];
}

const dbFailure = () => Object.assign(new Error("Can't reach database server"), { code: 'P1001' });
const view = (row, include) => {
  assert.deepEqual(Object.keys(include).sort(), ['orderItem', 'photos', 'user']);
  assert.deepEqual(include.photos.orderBy, { photoId: 'asc' });
  return { ...row, photos: [...row.photos].sort((a, b) => (a.photoId < b.photoId ? -1 : 1)).map((p) => ({ photoUrl: p.photoUrl })) };
};

let txCalls;
let queryLog;
let inFlight = 0;
let overlapped = false;
const track = (name, fn) => async (...args) => {
  if (inFlight > 0) overlapped = true;
  inFlight += 1;
  queryLog.push(name);
  try {
    await new Promise((resolve) => setImmediate(resolve));
    return await fn(...args);
  } finally {
    inFlight -= 1;
  }
};
const txClient = {
  review: {
    findMany: track('review.findMany', async ({ orderBy, include }) => {
      if (failOn) throw dbFailure();
      assert.deepEqual(orderBy, [{ createdAt: 'desc' }, { reviewId: 'desc' }]);
      return reviews.map((row) => view(row, include));
    }),
    updateMany: track('review.updateMany', async ({ where, data }) => {
      const row = reviews.find((x) => x.reviewId === where.reviewId);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    findUnique: track('review.findUnique', async ({ where, include }) => view(reviews.find((x) => x.reviewId === where.reviewId), include)),
  },
};
fakePrisma.review = new Proxy({}, { get: (_, name) => async () => { throw new Error(`review.${String(name)} lewat Prisma global`); } });
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
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/reviews`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  reviews = seed();
  failOn = false;
  txCalls = [];
  queryLog = [];
  overlapped = false;
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const req = async (path = '', { method = 'GET', body, token = tokenFor('3') } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

test('Staf & Owner diizinkan; tamu 401, pelanggan 403 di semua endpoint tanpa menyentuh data', async () => {
  for (const [path, opts] of [['', {}], ['/1/reply', { method: 'PUT', body: { admin_reply: 'x' } }], ['/1/hidden', { method: 'PATCH', body: { is_hidden: true } }]]) {
    assert.equal((await req(path, { ...opts, token: null })).status, 401, path);
    assert.equal((await req(path, { ...opts, token: tokenFor('1') })).status, 403, path);
  }
  assert.deepEqual([txCalls, reviews[0].adminReply, reviews[0].isHidden], [[], null, false]);
  assert.equal((await req('', { token: tokenFor('3') })).status, 200);
  assert.equal((await req('', { token: tokenFor('4') })).status, 200);
});

test('daftar: semua ulasan termasuk tersembunyi, terbaru lalu id; ringkasan dari semua ulasan; snapshot REPEATABLE READ', async () => {
  const { status, json } = await req();
  assert.equal(status, 200);
  assert.deepEqual(txCalls.map((o) => o?.isolationLevel), ['RepeatableRead']);
  assert.deepEqual([queryLog, overlapped], [['review.findMany'], false]);
  assert.deepEqual(json.data.summary, { total: 4, hidden: 1, unreplied: 3 });
  assert.deepEqual(json.data.rows.map((r) => r.review_id), ['3', '2', '1', '9']);
  assert.deepEqual(json.data.rows[2], {
    review_id: '1', rating: 5, tags: ['Lembut', 'Wangi'], comment: 'Enak sekali', admin_reply: null, is_hidden: false,
    created_at: '2026-10-30T03:00:00.000Z', reviewer_name: 'Anisa Pelanggan', product_id: '1', product_name: 'Classic Butter Croissant',
    variant_name: null, order_number: 'OVC-261030-001', photos: ['/uploads/reviews/a.jpg', '/uploads/reviews/b.jpg'],
  });
  assert.deepEqual([json.data.rows[1].is_hidden, json.data.rows[1].variant_name, json.data.rows[1].admin_reply], [true, 'Extra Glaze', 'Terima kasih']);
  // relasi hilang → cadangan seperti mock
  assert.deepEqual([json.data.rows[3].reviewer_name, json.data.rows[3].product_name, json.data.rows[3].product_id, json.data.rows[3].order_number], ['Pelanggan', 'Produk', null, null]);
});

test('filter rating: bintang tepat, ringkasan tetap semua ulasan; rating tidak sah → 400 tanpa query', async () => {
  const lima = (await req('?rating=5')).json.data;
  assert.deepEqual([lima.rows.map((r) => r.review_id), lima.summary.total], [['3', '1'], 4]);
  assert.deepEqual((await req('?rating=3')).json.data.rows, []);
  queryLog = [];
  for (const q of ['?rating=6', '?rating=bintang', '?rating=1&rating=2']) {
    const { status, json } = await req(q);
    assert.deepEqual([status, json.message], [400, 'Filter rating tidak valid.'], q);
  }
  assert.deepEqual(queryLog, []);
});

test('balas: disimpan ter-trim, hanya kolom balasan berubah, ubah balasan lama; validasi 400 tanpa menulis', async () => {
  const { status, json } = await req('/1/reply', { method: 'PUT', body: { admin_reply: '  Terima kasih, Kak!  ' } });
  assert.equal(status, 200);
  assert.deepEqual([json.data.review_id, json.data.admin_reply, json.data.is_hidden, json.data.rating], ['1', 'Terima kasih, Kak!', false, 5]);
  assert.equal(reviews[0].adminReply, 'Terima kasih, Kak!');
  assert.deepEqual(queryLog, ['review.updateMany', 'review.findUnique']);
  // ubah balasan pada ulasan tersembunyi: status sembunyi tidak tersentuh
  assert.equal((await req('/2/reply', { method: 'PUT', body: { admin_reply: 'Maaf atas kurangnya' } })).json.data.is_hidden, true);

  const snapshot = () => JSON.stringify(reviews, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
  const before = snapshot();
  for (const [body, message] of [[{}, 'Tulis balasan terlebih dahulu'], [{ admin_reply: '   ' }, 'Tulis balasan terlebih dahulu'], [{ admin_reply: 7 }, 'Tulis balasan terlebih dahulu'], [{ admin_reply: 'x'.repeat(501) }, 'Balasan maksimal 500 karakter']]) {
    const res = await req('/1/reply', { method: 'PUT', body });
    assert.deepEqual([res.status, res.json.message], [400, message]);
  }
  assert.equal(snapshot(), before);
  assert.equal((await req('/1/reply', { method: 'PUT', body: { admin_reply: 'x'.repeat(500) } })).status, 200);
});

test('sembunyikan/tampilkan: nilai tujuan, idempoten, hanya kolom is_hidden berubah', async () => {
  for (let i = 0; i < 2; i += 1) {
    const { status, json } = await req('/1/hidden', { method: 'PATCH', body: { is_hidden: true } });
    assert.deepEqual([status, json.data.is_hidden, json.data.admin_reply], [200, true, null]);
  }
  assert.equal(reviews[0].isHidden, true);
  assert.equal((await req('/1/hidden', { method: 'PATCH', body: { is_hidden: false } })).json.data.is_hidden, false);
  for (const body of [{}, { is_hidden: 'true' }, { is_hidden: 1 }]) {
    const res = await req('/1/hidden', { method: 'PATCH', body });
    assert.deepEqual([res.status, res.json.message], [400, 'Status tampil ulasan tidak valid.']);
  }
  assert.equal(reviews[0].isHidden, false);
});

test('ulasan tidak ada → 404; id tidak sah → 400 INVALID_ID sebelum validasi body/transaksi', async () => {
  for (const [path, opts] of [['/404/reply', { method: 'PUT', body: { admin_reply: 'Halo' } }], ['/404/hidden', { method: 'PATCH', body: { is_hidden: true } }]]) {
    const { status, json } = await req(path, opts);
    assert.deepEqual([status, json.message], [404, 'Ulasan tidak ditemukan'], path);
  }
  txCalls = [];
  for (const id of ['abc', '0', '1.5', '9223372036854775808']) {
    const { status, json } = await req(`/${id}/reply`, { method: 'PUT', body: {} });
    assert.deepEqual([status, json.code, json.message], [400, 'INVALID_ID', 'ID ulasan tidak valid.'], id);
  }
  assert.deepEqual(txCalls, []);
});

test('gagal basis data → 500 dengan pesan umum (detail tidak bocor)', async (t) => {
  t.mock.method(console, 'error', () => {});
  failOn = true;
  const { status, json } = await req();
  assert.deepEqual([status, json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
});
