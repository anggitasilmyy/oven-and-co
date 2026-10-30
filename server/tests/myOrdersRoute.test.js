// Regresi tingkat HTTP: GET /api/orders & GET /api/orders/:orderNumber (FR-17 · BR-07 · BR-08 · BR-11 · C-17 · C-18)
// — auth, peran, isolasi antar-pelanggan, bentuk kartu & detail sesuai client services/mock/myOrderViews.js,
// harga salinan saat pesan, stepper status, dan membaca tidak mengubah data. Prisma dipalsukan (helpers/orderDb.js).

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

const item = (overrides = {}) => ({ cart_item_id: 'c1', product_id: '1', quantity: 1, note: '', ...overrides });
const place = async (sub, overrides = {}) => {
  const { status, json } = await call('POST', '/orders', tokenFor(sub), {
    items: [item()], fulfillment: 'pickup', address_id: null, ready_date: dayKey(0), time_slot: '09.00–11.00',
    voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  });
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.order_number;
};
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const snapshot = () => JSON.stringify(db.t, (key, value) => (typeof value === 'bigint' ? String(value) : value));

test('tamu, token tidak valid, akun nonaktif, staf/owner ditolak di daftar & detail', async () => {
  const expired = jwt.sign({ sub: '1', exp: Math.floor(NOW.getTime() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  for (const path of ['/orders', '/orders/OVC-261020-001']) {
    assert.equal((await call('GET', path)).status, 401);
    for (const token of ['token-palsu', expired, tokenFor('5')]) {
      const { status, json } = await call('GET', path, token);
      assert.deepEqual([status, json.code], [401, 'SESSION_INVALID']);
    }
    for (const sub of ['3', '4']) assert.equal((await call('GET', path, tokenFor(sub))).status, 403);
  }
});

test('GET /orders: pelanggan tanpa pesanan → []', async () => {
  assert.deepEqual((await call('GET', '/orders', tokenFor('1'))).json, { status: 'success', data: [] });
});

test('GET /orders: hanya milik sendiri, terbaru dulu, bentuk kartu C-17', async () => {
  const first = await place('1', { items: [item({ quantity: 2 }), item({ cart_item_id: 'c2', product_id: '2', variant_id: '21' })] });
  await place('2');
  orderRow(first).createdAt = new Date(NOW.getTime() - 3600000);
  const second = await place('1', { items: [item({ product_id: '3' })], ready_date: dayKey(2) });

  const { status, json } = await call('GET', '/orders?userId=2', tokenFor('1'));

  assert.equal(status, 200);
  assert.deepEqual(json.data.map((card) => card.order_number), [second, first]);
  assert.deepEqual(Object.keys(json.data[1]).sort(), [
    'can_review', 'created_at', 'fulfillment_type', 'item_count', 'items_summary', 'order_number', 'order_status',
    'ready_date', 'thumbnails', 'time_slot', 'total',
  ]);
  assert.deepEqual(json.data[1], {
    order_number: first, created_at: '2026-10-20T00:00:00.000Z', order_status: 'menunggu_pembayaran',
    fulfillment_type: 'pickup', ready_date: dayKey(0), time_slot: '09.00–11.00', total: 86000, item_count: 3,
    items_summary: ['Classic Butter Croissant', 'Cinnamon Roll'],
    thumbnails: [{ name: 'Classic Butter Croissant', image_url: '/img/1.webp' }, { name: 'Cinnamon Roll', image_url: '/img/2.webp' }],
    can_review: false,
  });
});

test('GET /orders: can_review hanya untuk Selesai dengan item yang belum diulas (BR-11)', async () => {
  const number = await place('1');
  orderRow(number).orderStatus = 'selesai';
  assert.equal((await call('GET', '/orders', tokenFor('1'))).json.data[0].can_review, true);

  db.t.reviews.push({ reviewId: 1n, orderItemId: db.t.orderItems[0].orderItemId });
  assert.equal((await call('GET', '/orders', tokenFor('1'))).json.data[0].can_review, false);
});

test('GET /orders/:no: detail C-18 — harga salinan saat pesan, varian, stepper, aksi, toko', async () => {
  const number = await place('1', { items: [item({ quantity: 2 }), item({ cart_item_id: 'c2', product_id: '2', variant_id: '21' })] });
  db.t.products.find((p) => p.productId === 1n).price = '99000.00'; // harga berubah setelah pesan

  const { status, json } = await call('GET', `/orders/${number}`, tokenFor('1'));

  assert.equal(status, 200);
  const detail = json.data;
  assert.deepEqual(Object.keys(detail).sort(), ['can_cancel', 'can_review', 'items', 'method_name', 'order', 'pay_before_time', 'steps', 'store']);
  assert.equal(detail.order.order_number, number);
  assert.equal(detail.order.subtotal, 86000);
  assert.match(detail.order.pickup_code, /^PK\d{4}$/);
  assert.deepEqual(detail.items.map((i) => [i.name, i.variant_name, i.quantity, i.unit_price, i.line_total, i.reviewed]), [
    ['Classic Butter Croissant', null, 2, 28000, 56000, false],
    ['Cinnamon Roll', 'Extra Glaze', 1, 30000, 30000, false],
  ]);
  assert.equal(typeof detail.items[0].order_item_id, 'string');
  assert.equal(detail.method_name, 'QRIS');
  assert.deepEqual(detail.steps.map((s) => [s.status, s.state, s.changed_at]), [
    ['menunggu_pembayaran', 'current', NOW.toISOString()],
    ['dikonfirmasi', 'upcoming', null],
    ['sedang_disiapkan', 'upcoming', null],
    ['siap_diambil', 'upcoming', null],
    ['selesai', 'upcoming', null],
  ]);
  assert.equal(detail.steps[0].label, 'Menunggu Pembayaran');
  assert.deepEqual(detail.store, {
    address: 'Jl. Toko 1',
    whatsapp_link: `https://wa.me/6281200000000?text=${encodeURIComponent(`Halo Oven & Co., saya ingin bertanya tentang pesanan ${number}.`)}`,
  });
  assert.equal(detail.pay_before_time, null);
  assert.equal(detail.can_cancel, true);
  assert.equal(detail.can_review, false);
});

test('GET /orders/:no: Bayar di Toko belum lunas → pay_before_time = jam tutup; delivery → langkah Dalam Pengiriman', async () => {
  const store = await place('1', { method_code: 'pay_at_store' });
  const storeDetail = (await call('GET', `/orders/${store}`, tokenFor('1'))).json.data;
  assert.equal(storeDetail.pay_before_time, '20:00');
  assert.deepEqual(storeDetail.steps.map((s) => s.status), ['dikonfirmasi', 'sedang_disiapkan', 'siap_diambil', 'selesai']);

  const delivery = await place('1', { fulfillment: 'delivery', address_id: '10' });
  const deliveryDetail = (await call('GET', `/orders/${delivery}`, tokenFor('1'))).json.data;
  assert.equal(deliveryDetail.order.delivery_address_snapshot, 'Rumah · Anisa (+6281234567890) · Jl. Dekat 1');
  assert.equal(deliveryDetail.order.pickup_code, null);
  assert.ok(deliveryDetail.steps.some((s) => s.status === 'dalam_pengiriman'));
});

test('GET /orders/:no: pesanan dibatalkan → langkah yang dilalui + Dibatalkan; tidak bisa dibatalkan lagi', async () => {
  const number = await place('1');
  const row = orderRow(number);
  row.orderStatus = 'dibatalkan';
  row.cancelReason = 'Salah pesan';
  db.t.statusHistories.push({ historyId: 9n, orderId: row.orderId, status: 'dibatalkan', changedBy: 1n, changedAt: new Date(NOW.getTime() + 60000) });

  const detail = (await call('GET', `/orders/${number}`, tokenFor('1'))).json.data;

  assert.deepEqual(detail.steps.map((s) => [s.status, s.state]), [['menunggu_pembayaran', 'done'], ['dibatalkan', 'current']]);
  assert.equal(detail.order.cancel_reason, 'Salah pesan');
  assert.equal(detail.can_cancel, false);
});

test('GET /orders/:no: pesanan pelanggan lain → 404; nomor tidak berformat → 400 INVALID_ID', async () => {
  const number = await place('2');
  const other = await call('GET', `/orders/${number}`, tokenFor('1'));
  assert.deepEqual([other.status, other.json.message], [404, 'Pesanan tidak ditemukan.']);

  const bad = await call('GET', '/orders/OVC-1', tokenFor('1'));
  assert.deepEqual([bad.status, bad.json.code], [400, 'INVALID_ID']);
});

test('membaca daftar & detail tidak mengubah data (termasuk pesanan yang batas bayarnya sudah lewat)', async () => {
  const number = await place('1');
  db.t.payments[0].expiredAt = new Date(NOW.getTime() - 60000);
  const before = snapshot();

  await call('GET', '/orders', tokenFor('1'));
  const detail = await call('GET', `/orders/${number}`, tokenFor('1'));

  assert.equal(detail.json.data.order.order_status, 'menunggu_pembayaran');
  assert.equal(snapshot(), before);
});

test('error database → 500 pesan umum', async (t) => {
  t.mock.method(console, 'error', () => {});
  const number = await place('1');

  db.failOn = 'order.findMany';
  assert.deepEqual((await call('GET', '/orders', tokenFor('1'))).json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
  db.failOn = 'order.findFirst';
  assert.equal((await call('GET', `/orders/${number}`, tokenFor('1'))).status, 500);
});
