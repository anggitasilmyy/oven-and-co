// Regresi tingkat HTTP: keranjang akun tersimpan (FR-04 · FR-11 · BR-04 · C-12) —
// GET /api/cart/items, PUT /api/cart/items, POST /api/cart/merge: auth & peran, isolasi antar-akun, gabung,
// validasi produk/varian/jumlah, klaim desain tamu hanya dengan design_token sah, dan POST /api/cart tetap tamu.
// Prisma dipalsukan (tabel di memori, $transaction meniru rollback). Tidak membuktikan locking MySQL sungguhan.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const { signDesignToken } = require('../src/utils/designToken');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  2: { userId: 2n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  5: { userId: 5n, role: 'customer', isActive: false },
};

const products = [
  { productId: 1n, variants: [] },
  { productId: 2n, variants: [{ variantId: 21n }] },
  { productId: 3n, variants: [], isActive: false },
  { productId: 6n, variants: [] },
];

let db;
let locks;

function freshDb() {
  return {
    carts: [],
    cartItems: [],
    designs: [
      { designId: 90n, productId: 6n, userId: 1n, orderItems: [] }, // milik pelanggan 1
      { designId: 91n, productId: 6n, userId: null, orderItems: [] }, // desain tamu
      { designId: 92n, productId: 6n, userId: null, orderItems: [{ orderItemId: 1n }] }, // tamu, sudah dipesan
      { designId: 93n, productId: 6n, userId: 2n, orderItems: [] }, // milik pelanggan 2
    ],
    nextCartId: 1n,
    nextItemId: 1n,
  };
}

const pick = (row, select) =>
  select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row;

const withItems = (cart, include) =>
  include?.items ? { ...cart, items: db.cartItems.filter((i) => i.cartId === cart.cartId).sort((a, b) => (a.cartItemId < b.cartItemId ? -1 : 1)) } : cart;

fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
fakePrisma.product = {
  findMany: async ({ where, select }) => products.filter((p) => matchesWhere(p, where)).map((p) => pick(p, select)),
};
fakePrisma.customCakeDesign = {
  findMany: async ({ where, select }) => db.designs.filter((d) => matchesWhere(d, where)).map((d) => pick(d, select)),
  updateMany: async ({ where, data }) => {
    let count = 0;
    db.designs = db.designs.map((d) => (matchesWhere(d, where) ? (count += 1, { ...d, ...data }) : d));
    return { count };
  },
};
fakePrisma.cart = {
  findFirst: async ({ where, orderBy, include }) => {
    assert.deepEqual(orderBy, { cartId: 'asc' });
    const cart = db.carts.filter((c) => matchesWhere(c, where)).sort((a, b) => (a.cartId < b.cartId ? -1 : 1))[0];
    return cart ? withItems(cart, include) : null;
  },
  create: async ({ data }) => {
    const cart = { cartId: db.nextCartId++, sessionToken: null, updatedAt: new Date(), ...data };
    db.carts.push(cart);
    return cart;
  },
  update: async ({ where, data }) => {
    const cart = db.carts.find((c) => c.cartId === where.cartId);
    Object.assign(cart, data);
    return cart;
  },
};
fakePrisma.cartItem = {
  deleteMany: async ({ where }) => {
    const before = db.cartItems.length;
    db.cartItems = db.cartItems.filter((i) => !matchesWhere(i, where));
    return { count: before - db.cartItems.length };
  },
  createMany: async ({ data }) => {
    for (const row of data) db.cartItems.push({ cartItemId: db.nextItemId++, ...row });
    return { count: data.length };
  },
  findMany: async ({ where }) =>
    db.cartItems.filter((i) => matchesWhere(i, where)).sort((a, b) => (a.cartItemId < b.cartItemId ? -1 : 1)),
};
fakePrisma.$queryRaw = async (strings, ...values) => {
  locks.push(`${strings.join('?').trim()} [${values.join(',')}]`);
  return [];
};
fakePrisma.$transaction = async (callback) => {
  const snapshot = structuredClone(db);
  try {
    return await callback(fakePrisma);
  } catch (error) {
    db = snapshot;
    throw error;
  }
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/cart`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  db = freshDb();
  locks = [];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path, token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const line = (overrides) => ({ cart_item_id: 1, product_id: '1', quantity: 1, ...overrides });

const ENDPOINTS = [['GET', '/items'], ['PUT', '/items', { items: [] }], ['POST', '/merge', { items: [] }]];

test('tamu → 401 di ketiga endpoint; token rusak/kedaluwarsa/akun nonaktif → 401 SESSION_INVALID', async () => {
  for (const [method, path, body] of ENDPOINTS) {
    const { status, json } = await call(method, path, null, body);
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(json.message, 'Autentikasi diperlukan.');
  }

  const expired = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
  for (const token of ['token-palsu', expired, tokenFor('5')]) {
    const { status, json } = await call('GET', '/items', token);
    assert.equal(status, 401);
    assert.equal(json.code, 'SESSION_INVALID');
  }
});

test('staf dan owner → 403, tidak ada keranjang yang dibuat', async () => {
  for (const sub of ['3', '4']) {
    for (const [method, path, body] of ENDPOINTS) {
      const { status } = await call(method, path, tokenFor(sub), body);
      assert.equal(status, 403, `${sub} ${method} ${path}`);
    }
  }
  assert.equal(db.carts.length, 0);
});

test('GET tanpa keranjang tersimpan → items []', async () => {
  assert.deepEqual((await call('GET', '/items', tokenFor('1'))).json, { status: 'success', data: { items: [] } });
});

test('PUT menyimpan lalu GET mengembalikan bentuk item useCartStore', async () => {
  const body = {
    items: [
      line({ cart_item_id: 11, product_id: '2', variant_id: '21', quantity: 2, note: '  tanpa kismis ' }),
      line({ cart_item_id: 12, product_id: '1', preferred_date: '2026-11-02' }),
    ],
  };
  const put = await call('PUT', '/items', tokenFor('1'), body);
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.data.skipped, []);

  const { json } = await call('GET', '/items', tokenFor('1'));
  assert.deepEqual(json.data.items, [
    { cart_item_id: 1, product_id: '2', variant_id: '21', design_id: null, design_token: null, quantity: 2, preferred_date: null, note: 'tanpa kismis' },
    { cart_item_id: 2, product_id: '1', variant_id: null, design_id: null, design_token: null, quantity: 1, preferred_date: '2026-11-02', note: null },
  ]);
  assert.equal(db.carts.length, 1);
  assert.equal(db.carts[0].userId, 1n);
  assert.equal(db.carts[0].sessionToken, null);
  assert.ok(locks.some((l) => l.includes('FROM users') && l.includes('FOR UPDATE') && l.endsWith('[1]')));
});

test('PUT mengganti seluruh isi (bukan menambah); PUT [] mengosongkan', async () => {
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '1', quantity: 3 })] });
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '2' })] });
  let items = (await call('GET', '/items', tokenFor('1'))).json.data.items;
  assert.deepEqual(items.map((i) => [i.product_id, i.quantity]), [['2', 1]]);

  await call('PUT', '/items', tokenFor('1'), { items: [] });
  items = (await call('GET', '/items', tokenFor('1'))).json.data.items;
  assert.deepEqual(items, []);
  assert.equal(db.carts.length, 1);
});

test('isolasi antar-akun: pelanggan 2 tidak melihat atau menimpa keranjang pelanggan 1', async () => {
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '1', quantity: 4 })] });
  assert.deepEqual((await call('GET', '/items', tokenFor('2'))).json.data.items, []);

  await call('PUT', '/items', tokenFor('2'), { items: [line({ product_id: '2' })] });
  const mine = (await call('GET', '/items', tokenFor('1'))).json.data.items;
  assert.deepEqual(mine.map((i) => [i.product_id, i.quantity]), [['1', 4]]);
  assert.equal(db.carts.length, 2);
});

test('merge: item sama dijumlahkan, item baru ditambahkan, tidak dipotong > 99', async () => {
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '1', quantity: 60, note: 'a' })] });
  const { status, json } = await call('POST', '/merge', tokenFor('1'), {
    items: [line({ cart_item_id: 5, product_id: '1', quantity: 50, note: 'a ' }), line({ cart_item_id: 6, product_id: '2' })],
  });
  assert.equal(status, 200);
  assert.deepEqual(json.data.items.map((i) => [i.product_id, i.quantity]), [['1', 110], ['2', 1]]);
  assert.deepEqual(json.data.skipped, []);
});

test('merge ke akun tanpa keranjang tersimpan → keranjang dibuat dari item tamu', async () => {
  const { json } = await call('POST', '/merge', tokenFor('2'), { items: [line({ product_id: '1', quantity: 2 })] });
  assert.deepEqual(json.data.items.map((i) => [i.product_id, i.quantity]), [['1', 2]]);
  assert.equal(db.carts[0].userId, 2n);
});

test('produk tidak ada / varian bukan milik produk → dilewati (skipped), baris lain tetap tersimpan', async () => {
  const { status, json } = await call('POST', '/merge', tokenFor('1'), {
    items: [
      line({ cart_item_id: 1, product_id: '999' }),
      line({ cart_item_id: 2, product_id: '1', variant_id: '21' }),
      line({ cart_item_id: 3, product_id: '3' }), // nonaktif: tetap disimpan, ditandai POST /api/cart
    ],
  });
  assert.equal(status, 200);
  assert.deepEqual(json.data.skipped, [
    { cart_item_id: 1, product_id: '999', design_id: null, reason: 'product_not_found' },
    { cart_item_id: 2, product_id: '1', design_id: null, reason: 'variant_not_found' },
  ]);
  assert.deepEqual(json.data.items.map((i) => i.product_id), ['3']);
});

test('validasi body: jumlah tidak sah / format salah → 400 dan keranjang tersimpan tidak berubah', async () => {
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '1', quantity: 2 })] });

  for (const body of [
    { items: [line({ quantity: 0 })] },
    { items: [line({ quantity: 1.5 })] },
    { items: [line({ product_id: 'abc' })] },
    { items: [line({ preferred_date: '2026-02-30' })] },
    { items: 'x' },
    {},
  ]) {
    for (const [method, path] of [['PUT', '/items'], ['POST', '/merge']]) {
      const { status } = await call(method, path, tokenFor('1'), body);
      assert.equal(status, 400, `${method} ${JSON.stringify(body)}`);
    }
  }
  const items = (await call('GET', '/items', tokenFor('1'))).json.data.items;
  assert.deepEqual(items.map((i) => [i.product_id, i.quantity]), [['1', 2]]);
});

test('jumlah melebihi INT setelah digabung → 400 dan transaksi dibatalkan', async () => {
  await call('PUT', '/items', tokenFor('1'), { items: [line({ product_id: '1', quantity: 2147483000 })] });
  const { status, json } = await call('POST', '/merge', tokenFor('1'), { items: [line({ product_id: '1', quantity: 1000 })] });
  assert.equal(status, 400);
  assert.equal(json.message, 'Jumlah item terlalu besar.');
  assert.equal((await call('GET', '/items', tokenFor('1'))).json.data.items[0].quantity, 2147483000);
});

test('hasil gabung > 100 baris → 400, keranjang akun tidak berubah', async () => {
  const many = (start) => Array.from({ length: 60 }, (_, i) => line({ cart_item_id: start + i, product_id: '1', note: `n${start + i}` }));
  await call('PUT', '/items', tokenFor('1'), { items: many(0) });
  const { status } = await call('POST', '/merge', tokenFor('1'), { items: many(100) });
  assert.equal(status, 400);
  assert.equal((await call('GET', '/items', tokenFor('1'))).json.data.items.length, 60);
});

test('desain tamu dengan design_token sah → diklaim (user_id diisi) lalu tersimpan', async () => {
  const { json } = await call('POST', '/merge', tokenFor('1'), {
    items: [line({ product_id: '6', design_id: '91', design_token: signDesignToken(91n) })],
  });
  assert.deepEqual(json.data.skipped, []);
  assert.deepEqual(json.data.items.map((i) => [i.design_id, i.design_token]), [['91', null]]);
  assert.equal(db.designs.find((d) => d.designId === 91n).userId, 1n);
  assert.ok(locks.some((l) => l.includes('custom_cake_designs') && l.endsWith('[91]')));
});

test('desain tamu tanpa token / token salah / token desain lain → tidak diklaim, dilewati', async () => {
  for (const designToken of [null, 'token-palsu', signDesignToken(92n)]) {
    const { json } = await call('POST', '/merge', tokenFor('1'), {
      items: [line({ product_id: '6', design_id: '91', design_token: designToken })],
    });
    assert.deepEqual(json.data.skipped.map((s) => s.reason), ['design_not_found'], String(designToken));
    assert.deepEqual(json.data.items, []);
  }
  assert.equal(db.designs.find((d) => d.designId === 91n).userId, null);
});

test('desain tamu yang sudah dipesan → tidak diklaim walau token sah', async () => {
  const { json } = await call('POST', '/merge', tokenFor('1'), {
    items: [line({ product_id: '6', design_id: '92', design_token: signDesignToken(92n) })],
  });
  assert.deepEqual(json.data.skipped.map((s) => s.reason), ['design_not_found']);
  assert.equal(db.designs.find((d) => d.designId === 92n).userId, null);
});

test('desain milik pelanggan lain → dilewati walau token sah; pemiliknya tidak berubah', async () => {
  const { json } = await call('PUT', '/items', tokenFor('1'), {
    items: [line({ product_id: '6', design_id: '93', design_token: signDesignToken(93n) })],
  });
  assert.deepEqual(json.data.skipped.map((s) => s.reason), ['design_not_found']);
  assert.equal(db.designs.find((d) => d.designId === 93n).userId, 2n);
});

test('desain milik sendiri tersimpan tanpa token; desain sama di dua baris digabung jadi satu', async () => {
  const { json } = await call('PUT', '/items', tokenFor('1'), {
    items: [
      line({ cart_item_id: 1, product_id: '6', design_id: '90', note: 'a' }),
      line({ cart_item_id: 2, product_id: '6', design_id: '90', note: 'b', quantity: 2 }),
    ],
  });
  assert.deepEqual(json.data.items.map((i) => [i.design_id, i.quantity, i.note]), [['90', 3, 'a']]);
});

test('desain yang sudah diklaim pelanggan 1 tidak bisa diklaim pelanggan 2 dengan token yang sama', async () => {
  const token = signDesignToken(91n);
  await call('POST', '/merge', tokenFor('1'), { items: [line({ product_id: '6', design_id: '91', design_token: token })] });
  const { json } = await call('POST', '/merge', tokenFor('2'), { items: [line({ product_id: '6', design_id: '91', design_token: token })] });
  assert.deepEqual(json.data.skipped.map((s) => s.reason), ['design_not_found']);
  assert.equal(db.designs.find((d) => d.designId === 91n).userId, 1n);
});

test('POST /api/cart (kalkulasi) tetap boleh untuk tamu — kontrak lama tidak berubah', async () => {
  fakePrisma.storeSetting = { findFirst: async () => ({ preorderCutoffTime: null }) };
  const original = fakePrisma.product.findMany;
  fakePrisma.product.findMany = async () => [];
  try {
    const { status, json } = await call('POST', '', null, { items: [line({ product_id: '1' })] });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json.data).sort(), [
      'exceeds_line_limit', 'line_limit', 'lines', 'ready_date', 'stock_issues', 'subtotal', 'today_key',
    ]);
  } finally {
    fakePrisma.product.findMany = original;
  }
});
