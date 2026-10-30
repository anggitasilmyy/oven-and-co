// Regresi tingkat HTTP: PATCH /api/orders/:no/cancel & POST /api/orders/:no/reorder (FR-19 · FR-20 · BR-08 · TF-09 ·
// TF-12) — auth, peran, kepemilikan, batas status, efek pembatalan (stok, voucher, poin, pembayaran, riwayat) tepat
// sekali, validasi alasan, dan "Pesan Lagi" yang hanya menghitung item (tidak membuat pesanan/pembayaran).
// Prisma dipalsukan (helpers/orderDb.js); tidak membuktikan locking MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 08.00 WIB
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);

let db;
let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

const call = async (method, path, token, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};

const item = (overrides = {}) => ({ cart_item_id: 'c1', product_id: '1', quantity: 2, ...overrides });
const place = async (sub = '1', overrides = {}) => {
  const { status, json } = await call('POST', '/orders', tokenFor(sub), {
    items: [item()], fulfillment: 'pickup', address_id: null, ready_date: dayKey(0), time_slot: '09.00–11.00',
    voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  });
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.order_number;
};
const cancel = (number, reason = 'Salah pilih tanggal', sub = '1') =>
  call('PATCH', `/orders/${number}/cancel`, tokenFor(sub), { reason });
const reorder = (number, items = [], sub = '1') => call('POST', `/orders/${number}/reorder`, tokenFor(sub), { items });
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const stockOf = (productId) => db.t.dailyStocks.find((s) => s.productId === BigInt(productId)).qtySold;
const snapshot = () => JSON.stringify(db.t, (key, value) => (typeof value === 'bigint' ? String(value) : value));

test('tamu, token tidak valid, akun nonaktif, staf/owner ditolak di batal & Pesan Lagi', async () => {
  const number = await place();
  const before = snapshot();
  const expired = jwt.sign({ sub: '1', exp: Math.floor(NOW.getTime() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

  for (const [method, path, body] of [
    ['PATCH', `/orders/${number}/cancel`, { reason: 'x' }], ['POST', `/orders/${number}/reorder`, { items: [] }],
  ]) {
    assert.equal((await call(method, path, null, body)).status, 401);
    for (const token of ['token-palsu', expired, tokenFor('5')]) {
      assert.equal((await call(method, path, token, body)).json.code, 'SESSION_INVALID');
    }
    for (const sub of ['3', '4']) assert.equal((await call(method, path, tokenFor(sub), body)).status, 403);
  }
  assert.equal(snapshot(), before);
});

test('batal Menunggu Pembayaran: stok kembali, voucher & poin dikembalikan, pembayaran failed, riwayat + alasan', async () => {
  const number = await place('1', { voucher_code: 'HEMAT10', use_points: true });
  assert.equal(stockOf(1), 4);
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 4);

  const { status, json } = await cancel(number, '  Salah pilih tanggal  ');

  assert.equal(status, 200);
  assert.deepEqual(json.data, { order_number: number });
  const order = orderRow(number);
  assert.equal(order.orderStatus, 'dibatalkan');
  assert.equal(order.cancelReason, 'Salah pilih tanggal');
  assert.equal(order.paymentStatus, 'unpaid');
  assert.equal(db.t.payments.find((p) => p.orderId === order.orderId).status, 'failed');
  assert.equal(stockOf(1), 2);
  assert.equal(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt, null);
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 5);
  const refund = db.t.pointTransactions.find((p) => p.type === 'refund');
  assert.deepEqual([refund.userId, refund.points, refund.orderId], [1n, order.pointsUsed, order.orderId]);
  const last = db.t.statusHistories[db.t.statusHistories.length - 1];
  assert.deepEqual([last.status, last.changedBy, last.note], ['dibatalkan', 1n, 'Salah pilih tanggal']);
  // Riwayat pesanan tetap ada (tidak dihapus)
  assert.equal(db.t.orderItems.filter((i) => i.orderId === order.orderId).length, 1);
});

test('batal pesanan lunas (Dikonfirmasi) → payment_status refunded & pembayaran refunded (TF-09: hanya dicatat)', async () => {
  const number = await place();
  await call('POST', `/payments/${number}/simulate-paid`, tokenFor('1'));

  assert.equal((await cancel(number)).status, 200);
  const order = orderRow(number);
  assert.equal(order.paymentStatus, 'refunded');
  assert.equal(db.t.payments.find((p) => p.orderId === order.orderId).status, 'refunded');
});

test('batal berulang / bersamaan: efek hanya sekali; Sedang Disiapkan ke atas ditolak (BR-08)', async () => {
  const number = await place('1', { use_points: true });
  assert.equal((await cancel(number)).status, 200);
  const before = snapshot();

  const repeat = await cancel(number);
  assert.deepEqual([repeat.status, repeat.json.message], [409, 'Pesanan ini sudah dibatalkan.']);
  assert.equal(snapshot(), before);

  // Request lain membatalkan saat request ini menunggu kunci baris pesanan
  const other = await place('1', { items: [item({ quantity: 1 })] });
  db.hooks.whileWaitingOrderLock = () => { orderRow(other).orderStatus = 'dibatalkan'; };
  assert.equal((await cancel(other)).status, 409);
  db.hooks.whileWaitingOrderLock = null;
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 1);

  for (const status of ['sedang_disiapkan', 'siap_diambil', 'dalam_pengiriman', 'selesai']) {
    const target = await place('1', { items: [item({ quantity: 1 })] });
    orderRow(target).orderStatus = status;
    const res = await cancel(target);
    assert.deepEqual([res.status, res.json.message], [409, 'Pesanan sudah disiapkan sehingga tidak bisa dibatalkan'], status);
    assert.equal(orderRow(target).orderStatus, status);
  }
});

test('batal: alasan kosong/terlalu panjang → 400; pesanan orang lain → 404; nomor rusak → 400', async () => {
  const number = await place();
  const foreign = await place('2', { items: [item({ quantity: 1 })] });
  const before = snapshot();

  assert.deepEqual((await cancel(number, '   ')).json.message, 'Tulis alasan pembatalan');
  assert.deepEqual((await cancel(number, 'x'.repeat(256))).json.message, 'Alasan maksimal 255 karakter');
  assert.equal((await call('PATCH', `/orders/${number}/cancel`, tokenFor('1'), {})).status, 400);
  assert.deepEqual([(await cancel(foreign)).status, (await cancel(foreign)).json.message], [404, 'Pesanan tidak ditemukan.']);
  assert.equal((await cancel('OVC-bad')).json.code, 'INVALID_ID');
  assert.equal(snapshot(), before);
});

test('Pesan Lagi: hanya rencana keranjang — stok ready dikurangi isi keranjang, custom & nonaktif dilewati, tanpa pesanan baru', async () => {
  const number = await place('1', {
    items: [item({ quantity: 3 }), item({ cart_item_id: 'c2', product_id: '2', variant_id: '21', quantity: 1 }),
      item({ cart_item_id: 'c3', product_id: '3', quantity: 1 }), item({ cart_item_id: 'c4', product_id: '6', design_id: '60', quantity: 1 })],
    ready_date: dayKey(3),
  });
  db.t.products.find((p) => p.productId === 3n).isActive = false;
  const ordersBefore = db.t.orders.length;
  const paymentsBefore = db.t.payments.length;

  // Sisa stok croissant hari ini 10 − 5 = 5; keranjang sudah berisi 3 → maksimal 2
  const { status, json } = await reorder(number, [{ cart_item_id: 'k1', product_id: '1', quantity: 3 }]);

  assert.equal(status, 200);
  assert.deepEqual(json.data.items, [
    { product_id: '1', variant_id: null, design_id: null, quantity: 2, note: '', preferred_date: null, name: 'Classic Butter Croissant', price: 28000, image_url: '/img/1.webp' },
  ]);
  assert.deepEqual(json.data.skipped, [
    { name: 'Cinnamon Roll', reason: 'stok hari ini habis' },
    { name: 'Sourdough', reason: 'tidak tersedia lagi' },
    { name: 'Custom Celebration Cake', reason: 'custom cake perlu didesain ulang' },
  ]);
  assert.equal(db.t.orders.length, ordersBefore);
  assert.equal(db.t.payments.length, paymentsBefore);
});

test('Pesan Lagi: pesanan orang lain → 404; keranjang tidak valid → 400; error database → 500', async (t) => {
  const foreign = await place('2', { items: [item({ quantity: 1 })] });
  assert.equal((await reorder(foreign)).status, 404);
  const own = await place();
  assert.equal((await reorder(own, [{ product_id: 'abc', quantity: 1 }])).status, 400);

  t.mock.method(console, 'error', () => {});
  db.failOn = 'order.findFirst';
  assert.deepEqual((await reorder(own)).json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});

test('batal: error database → 500 dan stok/voucher/poin tidak berubah', async (t) => {
  t.mock.method(console, 'error', () => {});
  const number = await place('1', { voucher_code: 'HEMAT10', use_points: true });
  const before = snapshot();

  db.failOn = 'order.update';
  assert.equal((await cancel(number)).status, 500);
  assert.equal(snapshot(), before);
});
