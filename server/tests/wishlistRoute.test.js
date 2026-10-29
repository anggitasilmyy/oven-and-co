// Regresi tingkat HTTP: /api/me/wishlist (FR-25 · UC-17 · C-23) — auth, peran, validasi id, idempoten,
// produk nonaktif, isolasi antar-pelanggan, dan tipe id string sesuai client services/wishlistService.js.
// Prisma dipalsukan (tabel wishlists di memori); server Express dijalankan di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
};

const product = (overrides) => ({
  categoryId: 3, price: 28000, availabilityType: 'ready', leadTimeDays: 0, isActive: true,
  category: { categoryId: 3, name: 'Pastry' }, images: [{ imageUrl: '/c-1.webp' }],
  dailyStocks: [{ qtyPlanned: 40, qtySold: 10 }],
  ...overrides,
});

const products = [
  product({ productId: 1n, name: 'Classic Butter Croissant' }),
  product({ productId: 2n, name: 'Cinnamon Roll' }),
  product({ productId: 3n, name: 'Roti Lama Nonaktif', isActive: false }),
  product({
    productId: 6n, name: 'Custom Celebration Cake', availabilityType: 'custom', leadTimeDays: 3, price: 450000,
    dailyStocks: [],
  }),
];

const reviews = [
  { rating: 4, isHidden: false, orderItem: { productId: 2n } },
  { rating: 1, isHidden: true, orderItem: { productId: 2n } },
];

let wishlists = [];
let clock = 0;
const nextCreatedAt = () => new Date(Date.UTC(2026, 9, 1) + (clock += 1000));

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.product = {
  findFirst: async ({ where }) => products.find((p) => matchesWhere(p, where)) ?? null,
  findMany: async ({ where }) => products.filter((p) => matchesWhere(p, where)),
};
fakePrisma.review = {
  findMany: async ({ where }) =>
    reviews.filter((r) => r.isHidden === where.isHidden && where.orderItem.is.productId.in.includes(r.orderItem.productId)),
};
fakePrisma.wishlist = {
  findMany: async ({ where }) =>
    wishlists
      .filter((w) => matchesWhere(w, where))
      .sort((a, b) => b.createdAt - a.createdAt || (a.productId < b.productId ? 1 : -1))
      .map((w) => ({ productId: w.productId })),
  upsert: async ({ where, create }) => {
    const { userId, productId } = where.userId_productId;
    const existing = wishlists.find((w) => w.userId === userId && w.productId === productId);
    if (existing) return existing;
    const row = { ...create, createdAt: nextCreatedAt() };
    wishlists.push(row);
    return row;
  },
  deleteMany: async ({ where }) => {
    const before = wishlists.length;
    wishlists = wishlists.filter((w) => !matchesWhere(w, where));
    return { count: before - wishlists.length };
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/me/wishlist`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  wishlists = [];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path = '', token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const seed = (userId, productId) =>
  wishlists.push({ userId: BigInt(userId), productId: BigInt(productId), createdAt: nextCreatedAt() });

test('tamu (tanpa token) → 401 di keempat endpoint, bukan 404', async () => {
  for (const [method, path] of [['GET', ''], ['GET', '/products'], ['POST', '/1'], ['DELETE', '/1']]) {
    const { status, json } = await call(method, path);
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }
});

test('token rusak, kedaluwarsa, dan akun nonaktif → 401 SESSION_INVALID', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });

  for (const token of ['token-palsu', expired, tokenFor('5')]) {
    const { status, json } = await call('GET', '', token);
    assert.equal(status, 401);
    assert.equal(json.code, 'SESSION_INVALID');
  }
});

test('staf dan owner → 403 tanpa kode sesi', async () => {
  for (const sub of ['3', '4']) {
    const { status, json } = await call('GET', '', tokenFor(sub));
    assert.equal(status, 403);
    assert.equal(json.code, undefined);
  }
});

test('wishlist kosong → 200 [] untuk id maupun produk', async () => {
  assert.deepEqual((await call('GET', '', tokenFor('1'))).json, { status: 'success', data: [] });
  assert.deepEqual((await call('GET', '/products', tokenFor('1'))).json, { status: 'success', data: [] });
});

test('POST menyimpan produk aktif; id dikembalikan sebagai string', async () => {
  const { status, json } = await call('POST', '/2', tokenFor('1'));
  assert.equal(status, 200);
  assert.deepEqual(json, { status: 'success', data: { product_id: '2', wishlisted: true } });

  const ids = (await call('GET', '', tokenFor('1'))).json.data;
  assert.deepEqual(ids, ['2']);
  assert.equal(typeof ids[0], 'string');
});

test('POST dua kali idempoten: satu baris, created_at pertama tetap', async () => {
  await call('POST', '/1', tokenFor('1'));
  const firstCreatedAt = wishlists[0].createdAt;

  const again = await call('POST', '/1', tokenFor('1'));
  assert.equal(again.status, 200);
  assert.equal(wishlists.length, 1);
  assert.equal(wishlists[0].createdAt, firstCreatedAt);
});

test('POST bersamaan yang gagal P2002 tetap dianggap tersimpan', async () => {
  const original = fakePrisma.wishlist.upsert;
  fakePrisma.wishlist.upsert = async () => {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  };

  try {
    const { status, json } = await call('POST', '/1', tokenFor('1'));
    assert.equal(status, 200);
    assert.deepEqual(json.data, { product_id: '1', wishlisted: true });
  } finally {
    fakePrisma.wishlist.upsert = original;
  }
});

test('POST produk nonaktif atau tidak ada → 404, tidak ada baris dibuat', async () => {
  for (const id of ['3', '999']) {
    const { status, json } = await call('POST', `/${id}`, tokenFor('1'));
    assert.equal(status, 404);
    assert.equal(json.message, 'Produk tidak ditemukan.');
  }
  assert.equal(wishlists.length, 0);
});

test('id tidak valid → 400 INVALID_ID untuk POST dan DELETE', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '01', '9223372036854775808', '%20']) {
    for (const method of ['POST', 'DELETE']) {
      const { status, json } = await call(method, `/${id}`, tokenFor('1'));
      assert.equal(status, 400, `${method} /${id}`);
      assert.equal(json.code, 'INVALID_ID');
    }
  }
});

test('DELETE idempoten; produk nonaktif yang tersimpan tetap bisa dihapus', async () => {
  seed(1, 3);
  const removed = await call('DELETE', '/3', tokenFor('1'));
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json.data, { product_id: '3', wishlisted: false });
  assert.equal(wishlists.length, 0);

  const again = await call('DELETE', '/3', tokenFor('1'));
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.data, { product_id: '3', wishlisted: false });
});

test('isolasi: pelanggan lain tidak melihat atau menghapus wishlist milik pelanggan 1; user_id dari body diabaikan', async () => {
  seed(1, 1);

  assert.deepEqual((await call('GET', '', tokenFor('2'))).json.data, []);
  assert.deepEqual((await call('GET', '/products', tokenFor('2'))).json.data, []);

  await call('DELETE', '/1', tokenFor('2'), { user_id: '1' });
  assert.deepEqual((await call('GET', '', tokenFor('1'))).json.data, ['1']);

  await call('POST', '/2', tokenFor('2'), { user_id: '1', userId: '1' });
  assert.deepEqual((await call('GET', '', tokenFor('1'))).json.data, ['1']);
  assert.deepEqual((await call('GET', '', tokenFor('2'))).json.data, ['2']);
});

test('GET /products: produk aktif saja, terakhir disimpan dulu, bentuk kartu katalog', async () => {
  seed(1, 1);
  seed(1, 3); // nonaktif → tidak tampil
  seed(1, 6);
  seed(1, 2);

  const { status, json } = await call('GET', '/products', tokenFor('1'));
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((p) => p.product_id), ['2', '6', '1']);

  const [roll, cake] = json.data;
  assert.deepEqual(Object.keys(roll).sort(), [
    'availability_type', 'category_id', 'category_name', 'image_url', 'is_active', 'lead_time_days', 'name',
    'price', 'product_id', 'rating', 'remaining_today',
  ]);
  assert.equal(typeof roll.product_id, 'string');
  assert.equal(roll.price, 28000);
  assert.equal(roll.remaining_today, 30);
  assert.deepEqual(roll.rating, { average: 4, count: 1 }); // ulasan tersembunyi tidak dihitung
  assert.equal(cake.remaining_today, null);
});

test('GET /wishlist mengembalikan id string yang cocok dengan product_id kartu produk', async () => {
  seed(1, 1);
  seed(1, 2);

  const ids = (await call('GET', '', tokenFor('1'))).json.data;
  const cards = (await call('GET', '/products', tokenFor('1'))).json.data;

  assert.ok(ids.every((id) => typeof id === 'string'));
  const idSet = new Set(ids);
  assert.ok(cards.every((card) => idSet.has(card.product_id)));
});

test('endpoint /api/me lain yang belum dibuat tetap 404 untuk pelanggan login', async () => {
  const res = await fetch(baseUrl.replace('/wishlist', '/endpoint-tidak-ada'), {
    headers: { Authorization: `Bearer ${tokenFor('1')}` },
  });
  assert.equal(res.status, 404);
});
