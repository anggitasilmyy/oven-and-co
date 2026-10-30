// Regresi tingkat HTTP: GET/POST /api/orders/:no/reviews & GET /api/products/:id/reviews (FR-09 · FR-21 · BR-11 ·
// C-10 · C-19) — auth, peran, kepemilikan, kelayakan (Selesai, item milik pesanan, satu ulasan per item), validasi
// rating/tag/komentar/foto, unggah multipart, bonus poin dari store_settings tepat sekali, pembersihan file yatim,
// dan tampilan ulasan publik. Prisma dipalsukan (helpers/orderDb.js; UNIQUE order_item_id ditiru) — BUKAN MySQL.
// Foto ditulis ke folder sementara SUNGGUHAN (UPLOAD_DIR) agar penyimpanan, penyajian, & pembersihan file teruji.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ovenco-review-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const app = require('../src/app');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 08.00 WIB
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);
const REVIEW_DIR = path.join(UPLOAD_DIR, 'reviews');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(24)]);

let db;
let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

test.beforeEach(() => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
  // Cukup stok untuk beberapa pesanan Selesai per tes
  db.t.dailyStocks.forEach((stock) => { stock.qtyPlanned = 100; });
  fs.rmSync(REVIEW_DIR, { recursive: true, force: true });
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, urlPath, token, body) => {
  const isForm = body instanceof FormData;
  const res = await fetch(`${baseUrl}/api${urlPath}`, {
    method,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const files = () => (fs.existsSync(REVIEW_DIR) ? fs.readdirSync(REVIEW_DIR) : []);
const photo = (buffer, type = 'image/png', name = 'foto.png') => ({ buffer, type, name });
const multipart = (fields, photos = [], { fieldName = 'review', fileField = 'photos' } = {}) => {
  const form = new FormData();
  if (fields !== undefined) form.append(fieldName, typeof fields === 'string' ? fields : JSON.stringify(fields));
  photos.forEach((p) => form.append(fileField, new Blob([p.buffer], { type: p.type }), p.name));
  return form;
};

/** Pesanan Selesai milik `sub`: croissant ×2 + cinnamon roll varian → [itemCroissant, itemCinnamon] */
const completedOrder = async (sub = '1', status = 'selesai') => {
  const { json } = await call('POST', '/orders', tokenFor(sub), {
    items: [
      { cart_item_id: 'c1', product_id: '1', quantity: 2 },
      { cart_item_id: 'c2', product_id: '2', variant_id: '21', quantity: 1 },
    ],
    fulfillment: 'pickup', address_id: null, ready_date: dayKey(0), time_slot: '09.00–11.00',
    voucher_code: null, use_points: false, method_code: 'qris',
  });
  const order = db.t.orders.find((o) => o.orderNumber === json.data.order_number);
  order.orderStatus = status;
  const items = db.t.orderItems.filter((i) => i.orderId === order.orderId).map((i) => String(i.orderItemId));
  return { number: order.orderNumber, items };
};
const review = (orderItemId, overrides = {}) => ({ order_item_id: orderItemId, rating: 5, tags: ['Fresh'], comment: 'Enak', ...overrides });
const submit = (number, body, sub = '1') => call('POST', `/orders/${number}/reviews`, tokenFor(sub), body);
const bonusRows = (userId = 1n) => db.t.pointTransactions.filter((p) => p.type === 'review_bonus' && p.userId === userId);
const snapshot = () => JSON.stringify(db.t, (key, value) => (typeof value === 'bigint' ? String(value) : value));

// ── Autentikasi & peran ──────────────────────────────────────────────────────────────────────────

test('tamu, token palsu/kedaluwarsa, akun nonaktif, staf/owner ditolak; ulasan produk publik tanpa login', async () => {
  const { number, items } = await completedOrder();
  const before = snapshot();
  const expired = jwt.sign({ sub: '1', exp: Math.floor(NOW.getTime() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

  for (const [method, body] of [['GET'], ['POST', review(items[0])]]) {
    assert.equal((await call(method, `/orders/${number}/reviews`, null, body)).status, 401);
    for (const token of ['token-palsu', expired, tokenFor('5')]) {
      assert.equal((await call(method, `/orders/${number}/reviews`, token, body)).json.code, 'SESSION_INVALID');
    }
    for (const sub of ['3', '4']) assert.equal((await call(method, `/orders/${number}/reviews`, tokenFor(sub), body)).status, 403);
  }
  assert.equal(snapshot(), before);

  const pub = await call('GET', '/products/1/reviews');
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.json.data.product, { product_id: '1', name: 'Classic Butter Croissant' });
});

// ── Form ulasan (C-19) ───────────────────────────────────────────────────────────────────────────

test('GET form: bentuk kontrak, bonus dari store_settings, status sudah diulas, hanya pesanan sendiri', async () => {
  const { number, items } = await completedOrder();
  db.t.storeSetting.reviewBonusPoints = 35;

  const { status, json } = await call('GET', `/orders/${number}/reviews`, tokenFor('1'));

  assert.equal(status, 200);
  assert.deepEqual(json.data, {
    order_number: number,
    can_review: true,
    bonus_points: 35,
    items: [
      { order_item_id: items[0], product_id: '1', name: 'Classic Butter Croissant', image_url: '/img/1.webp', variant_name: null, design: null, reviewed: false },
      { order_item_id: items[1], product_id: '2', name: 'Cinnamon Roll', image_url: '/img/2.webp', variant_name: 'Extra Glaze', design: null, reviewed: false },
    ],
  });

  await submit(number, review(items[0]));
  assert.deepEqual((await call('GET', `/orders/${number}/reviews`, tokenFor('1'))).json.data.items.map((i) => i.reviewed), [true, false]);

  assert.deepEqual((await call('GET', `/orders/${number}/reviews`, tokenFor('2'))).status, 404);
  assert.equal((await call('GET', '/orders/OVC-x/reviews', tokenFor('1'))).json.code, 'INVALID_ID');
});

test('GET form: pesanan belum Selesai → can_review false (tidak diubah menjadi Selesai)', async () => {
  const { number } = await completedOrder('1', 'dikonfirmasi');
  const { json } = await call('GET', `/orders/${number}/reviews`, tokenFor('1'));
  assert.equal(json.data.can_review, false);
  assert.equal(db.t.orders.find((o) => o.orderNumber === number).orderStatus, 'dikonfirmasi');
});

// ── Kirim ulasan ─────────────────────────────────────────────────────────────────────────────────

test('POST JSON tanpa foto: ulasan tersimpan, bonus review_bonus = store_settings dengan review_id, pemilik dari token', async () => {
  const { number, items } = await completedOrder();
  db.t.storeSetting.reviewBonusPoints = 35;

  const { status, json } = await submit(number, {
    ...review(items[0], { tags: ['Fresh', 'Lembut', 'Fresh'], comment: '  Renyah sekali  ' }), user_id: '2', points: 999,
  });

  assert.equal(status, 201);
  assert.deepEqual(json, { status: 'success', data: { review_id: json.data.review_id, points: 35 } });
  assert.equal(typeof json.data.review_id, 'string');
  const saved = db.t.reviews[0];
  assert.deepEqual(
    [saved.userId, String(saved.orderItemId), saved.rating, saved.tags, saved.comment, saved.isHidden],
    [1n, items[0], 5, 'Fresh, Lembut', 'Renyah sekali', false]
  );
  assert.deepEqual(bonusRows().map((p) => [p.points, String(p.reviewId), p.orderId]), [[35, json.data.review_id, undefined]]);
  assert.equal(bonusRows(2n).length, 0); // saldo pelanggan lain tidak tersentuh
});

test('POST multipart 3 foto (PNG/JPG/WebP): file tersimpan acak di /uploads/reviews, path ≤ 255, dapat disajikan', async () => {
  const { number, items } = await completedOrder();

  const { status } = await submit(number, multipart(review(items[0]), [
    photo(PNG), photo(JPG, 'image/jpeg', 'b.jpg'), photo(WEBP, 'image/webp', 'c.webp'),
  ]));

  assert.equal(status, 201);
  const urls = db.t.reviewPhotos.map((p) => p.photoUrl);
  assert.equal(urls.length, 3);
  urls.forEach((url) => {
    assert.match(url, /^\/uploads\/reviews\/[a-f0-9]{32}\.(png|jpg|webp)$/);
    assert.ok(url.length <= 255);
  });
  assert.deepEqual(files().sort(), urls.map((u) => path.basename(u)).sort());

  const served = await fetch(`${baseUrl}${urls[0]}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

  const pub = await call('GET', '/products/1/reviews');
  assert.deepEqual(pub.json.data.reviews[0].photos, urls);
});

test('rating batas 1 & 5 diterima; di luar rentang/desimal/string/null ditolak tanpa menulis apa pun', async () => {
  const { number, items } = await completedOrder();
  assert.equal((await submit(number, review(items[0], { rating: 1 }))).status, 201);
  assert.equal((await submit(number, review(items[1], { rating: 5 }))).status, 201);

  const other = await completedOrder();
  const before = snapshot();
  for (const rating of [0, 6, 4.5, '5', null, undefined]) {
    const res = await submit(other.number, review(other.items[0], { rating }));
    assert.deepEqual([res.status, res.json.message], [400, 'Pilih rating 1–5 bintang'], String(rating));
  }
  assert.equal(snapshot(), before);
});

test('tag tidak dikenal, komentar > 65.535 byte, data URL di JSON, body rusak → 400 tanpa ulasan/poin/file', async () => {
  const { number, items } = await completedOrder();
  const before = snapshot();
  const cases = [
    [review(items[0], { tags: ['Mahal'] }), 'Tag ulasan tidak valid'],
    [review(items[0], { tags: 'Fresh' }), 'Tag ulasan tidak valid'],
    [review(items[0], { comment: 'é'.repeat(40000) }), 'Komentar ulasan terlalu panjang.'],
    [review(items[0], { photos: ['data:image/png;base64,iVBORw0KGgo='] }), 'Foto ulasan harus dikirim sebagai file.'],
    [review('abc'), 'Produk tidak ada di pesanan ini'],
    [[], 'Data ulasan tidak valid.'],
  ];
  for (const [body, message] of cases) {
    const res = await submit(number, body);
    assert.deepEqual([res.status, res.json.message], [400, message]);
  }
  assert.equal(snapshot(), before);
  assert.deepEqual(files(), []);
});

test('unggahan tidak valid: 4 foto, GIF, MIME palsu, > 5 MB, field salah, metadata rusak → 400 tanpa file', async () => {
  const { number, items } = await completedOrder();
  const before = snapshot();
  const cases = [
    [multipart(review(items[0]), [photo(PNG), photo(PNG), photo(PNG), photo(PNG)]), 'Maksimal 3 foto'],
    [multipart(review(items[0]), [photo(GIF, 'image/gif', 'a.gif')]), 'Nama file foto tidak valid. Gunakan file JPG, PNG, atau WebP.'],
    [multipart(review(items[0]), [photo(GIF, 'image/png', 'a.png')]), 'Isi file bukan foto JPG, PNG, atau WebP yang valid.'],
    [multipart(review(items[0]), [photo(JPG, 'image/png', 'a.png')]), 'Isi file bukan foto JPG, PNG, atau WebP yang valid.'],
    [multipart(review(items[0]), [photo(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))]), 'Ukuran foto ulasan maksimal 5 MB.'],
    [multipart(review(items[0]), [photo(PNG)], { fileField: 'foto' }), 'Foto ulasan harus dikirim pada field photos.'],
    [multipart('{rusak', [photo(PNG)]), 'Data ulasan tidak valid.'],
    [multipart(undefined, [photo(PNG)]), 'Data ulasan tidak valid.'],
  ];
  for (const [form, message] of cases) {
    const res = await submit(number, form);
    assert.deepEqual([res.status, res.json.message], [400, message]);
  }
  assert.equal(snapshot(), before);
  assert.deepEqual(files(), []);
});

test('kelayakan: belum Selesai 409, pesanan orang lain 404, item pesanan lain 400, sudah diulas 409 — tanpa file/bonus', async () => {
  const pending = await completedOrder('1', 'sedang_disiapkan');
  const foreign = await completedOrder('2');
  const own = await completedOrder();
  const other = await completedOrder();
  const before = snapshot();
  const withPhoto = (body) => multipart(body, [photo(PNG)]);

  const notDone = await submit(pending.number, withPhoto(review(pending.items[0])));
  assert.deepEqual([notDone.status, notDone.json.message], [409, 'Ulasan hanya bisa diberikan untuk pesanan Selesai']);
  assert.equal((await submit(foreign.number, withPhoto(review(foreign.items[0])))).status, 404);
  const wrongItem = await submit(own.number, withPhoto(review(other.items[0])));
  assert.deepEqual([wrongItem.status, wrongItem.json.message], [400, 'Produk tidak ada di pesanan ini']);
  assert.equal((await submit(own.number, withPhoto(review('999999')))).status, 400);
  assert.equal(snapshot(), before);
  assert.deepEqual(files(), []);

  assert.equal((await submit(own.number, review(own.items[0]))).status, 201);
  const again = await submit(own.number, withPhoto(review(own.items[0], { rating: 1 })));
  assert.deepEqual([again.status, again.json.message], [409, 'Produk ini sudah kamu ulas']);
  assert.equal(bonusRows().length, 1);
  assert.equal(db.t.reviews.length, 1);
  assert.deepEqual(files(), []);
});

test('request bersamaan untuk item yang sama: satu ulasan & satu bonus; yang kalah (UNIQUE P2002) → 409 & file dihapus', async () => {
  const { number, items } = await completedOrder();
  // Request lain menyimpan ulasan item ini setelah pemeriksaan awal request ini tetapi sebelum INSERT-nya
  db.hooks.beforeReviewCreate = (data) => {
    db.hooks.beforeReviewCreate = null;
    const concurrent = { reviewId: 999n, userId: 1n, orderItemId: data.orderItemId, rating: 4, isHidden: false, createdAt: NOW };
    db.t.reviews.push(concurrent);
    db.reviewsCommittedElsewhere.push(concurrent);
  };

  const { status, json } = await submit(number, multipart(review(items[0]), [photo(PNG), photo(JPG, 'image/jpeg', 'b.jpg')]));

  assert.deepEqual([status, json.message], [409, 'Produk ini sudah kamu ulas']);
  assert.deepEqual(db.t.reviews.map((r) => r.reviewId), [999n]);
  assert.equal(bonusRows().length, 0);
  assert.equal(db.t.reviewPhotos.length, 0);
  assert.deepEqual(files(), []);

  // Dua request sungguhan dikirim bersamaan → tepat satu berhasil
  const results = await Promise.all([submit(number, review(items[1])), submit(number, review(items[1]))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(db.t.reviews.filter((r) => String(r.orderItemId) === items[1]).length, 1);
  assert.equal(bonusRows().length, 1);
});

test('kegagalan database setelah foto ditulis → 500, ulasan/foto/bonus dibatalkan, file yatim dihapus', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { number, items } = await completedOrder();
  const before = snapshot();

  for (const op of ['reviewPhoto.createMany', 'review.create']) {
    db.failOn = op;
    const res = await submit(number, multipart(review(items[0]), [photo(PNG), photo(PNG)]));
    assert.deepEqual(res.json, { status: 'error', message: 'Terjadi kesalahan pada server.' }, op);
    assert.equal(snapshot(), before);
    assert.deepEqual(files(), [], op);
  }
});

// ── Ulasan produk publik (C-10) ──────────────────────────────────────────────────────────────────

test('GET /products/:id/reviews: ringkasan & daftar tanpa ulasan tersembunyi, terbaru dulu, nama disingkat', async () => {
  const first = await completedOrder();
  const second = await completedOrder('2');
  await submit(first.number, multipart(review(first.items[0], { rating: 4, tags: ['Fresh', 'Tepat Waktu'] }), [photo(PNG)]));
  db.t.reviews[0].createdAt = new Date(NOW.getTime() - 3600000);
  await submit(second.number, review(second.items[0], { rating: 2, comment: '' }), '2');
  await submit(first.number, review(first.items[1], { rating: 5 })); // produk lain (cinnamon roll)
  const hidden = await completedOrder();
  await submit(hidden.number, review(hidden.items[0], { rating: 1 }));
  db.t.reviews[db.t.reviews.length - 1].isHidden = true;

  const { status, json } = await call('GET', '/products/1/reviews');

  assert.equal(status, 200);
  assert.deepEqual(json.data.summary, {
    average: 3, count: 2,
    distribution: [
      { stars: 5, count: 0, percent: 0 }, { stars: 4, count: 1, percent: 50 }, { stars: 3, count: 0, percent: 0 },
      { stars: 2, count: 1, percent: 50 }, { stars: 1, count: 0, percent: 0 },
    ],
    withPhotoCount: 1,
  });
  assert.deepEqual(json.data.reviews.map((r) => [r.reviewer_name, r.rating, r.comment, r.tags, r.photos.length]), [
    ['Budi', 2, null, ['Fresh'], 0],
    ['Anisa P.', 4, 'Enak', ['Fresh', 'Tepat Waktu'], 1],
  ]);
  assert.deepEqual(Object.keys(json.data.reviews[0]).sort(), [
    'admin_reply', 'comment', 'created_at', 'is_hidden', 'photos', 'rating', 'review_id', 'reviewer_name', 'tags', 'variant_name',
  ]);
  assert.ok(json.data.reviews.every((r) => r.is_hidden === false && typeof r.review_id === 'string'));

  const cinnamon = await call('GET', '/products/2/reviews');
  assert.equal(cinnamon.json.data.reviews[0].variant_name, 'Extra Glaze');
});

test('GET /products/:id/reviews: produk nonaktif/tidak ada → data null; id rusak → 400 INVALID_ID; error DB → 500', async (t) => {
  db.t.products.find((p) => p.productId === 4n).isActive = false;
  assert.deepEqual((await call('GET', '/products/4/reviews')).json, { status: 'success', data: null });
  assert.deepEqual((await call('GET', '/products/9999/reviews')).json, { status: 'success', data: null });
  assert.equal((await call('GET', '/products/abc/reviews')).json.code, 'INVALID_ID');

  t.mock.method(console, 'error', () => {});
  db.failOn = 'review.findMany';
  assert.equal((await call('GET', '/products/1/reviews')).status, 500);
});
