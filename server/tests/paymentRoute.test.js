// Regresi tingkat HTTP: POST /api/payments/:no/simulate-paid & PATCH /api/orders/:no/payment (FR-14 · FR-15 · BR-05 ·
// BR-06 · SPEC §4/§10) — auth, peran, kepemilikan, hanya Menunggu Pembayaran yang belum lewat batas, tanpa
// pembayaran ganda, nominal/status tidak dari klien, mode production, ganti metode & Bayar di Toko.
// Prisma dipalsukan (helpers/orderDb.js); kunci FOR UPDATE hanya dicatat — tidak membuktikan locking MySQL.

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

const place = async (sub = '1', overrides = {}) => {
  const { status, json } = await call('POST', '/orders', tokenFor(sub), {
    items: [{ cart_item_id: 'c1', product_id: '1', quantity: 1 }], fulfillment: 'pickup', address_id: null,
    ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  });
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.order_number;
};
const simulate = (number, sub = '1', body) => call('POST', `/payments/${number}/simulate-paid`, tokenFor(sub), body);
const changeMethod = (number, methodCode, sub = '1') => call('PATCH', `/orders/${number}/payment`, tokenFor(sub), { method_code: methodCode });
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const paymentOf = (number) => db.t.payments.find((p) => p.orderId === orderRow(number).orderId);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);
const snapshot = () => JSON.stringify(db.t, (key, value) => (typeof value === 'bigint' ? String(value) : value));

test('tamu, token tidak valid, akun nonaktif, staf/owner ditolak di simulasi & ganti metode', async () => {
  const number = await place();
  const before = snapshot();
  const expired = jwt.sign({ sub: '1', exp: Math.floor(NOW.getTime() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

  for (const [method, path, body] of [
    ['POST', `/payments/${number}/simulate-paid`], ['PATCH', `/orders/${number}/payment`, { method_code: 'bca_va' }],
  ]) {
    assert.equal((await call(method, path, null, body)).status, 401);
    for (const token of ['token-palsu', expired, tokenFor('5')]) {
      assert.equal((await call(method, path, token, body)).json.code, 'SESSION_INVALID');
    }
    for (const sub of ['3', '4']) assert.equal((await call(method, path, tokenFor(sub), body)).status, 403);
  }
  assert.equal(snapshot(), before);
});

test('simulasi lunas: pembayaran paid + paid_at, pesanan paid & Dikonfirmasi, riwayat oleh sistem', async () => {
  const number = await place();

  const { status, json } = await simulate(number, '1', { amount: 1, status: 'paid' });

  assert.equal(status, 200);
  assert.deepEqual(json, { status: 'success', data: { order_number: number } });
  assert.equal(paymentOf(number).status, 'paid');
  assert.equal(paymentOf(number).paidAt.toISOString(), NOW.toISOString());
  assert.equal(paymentOf(number).amount, 28000); // nominal dari pesanan, bukan dari body
  assert.equal(orderRow(number).paymentStatus, 'paid');
  assert.equal(orderRow(number).orderStatus, 'dikonfirmasi');
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n], ['dikonfirmasi', null]]);
  assert.ok(db.locks.some((l) => /FROM orders WHERE order_id = \? FOR UPDATE/.test(l.sql)));
});

test('simulasi berulang tidak membuat pembayaran ganda; request kedua yang menunggu kunci melihat status terbaru', async () => {
  const number = await place();
  assert.equal((await simulate(number)).status, 200);
  const before = snapshot();

  const repeat = await simulate(number);
  assert.deepEqual([repeat.status, repeat.json.message], [409, 'Pesanan tidak lagi menunggu pembayaran.']);
  assert.equal(snapshot(), before);

  // Dua request bersamaan: request lain melunasi saat request ini menunggu kunci baris pesanan
  const other = await place();
  db.hooks.whileWaitingOrderLock = () => {
    orderRow(other).orderStatus = 'dikonfirmasi';
    orderRow(other).paymentStatus = 'paid';
    paymentOf(other).status = 'paid';
  };
  const race = await simulate(other);
  assert.equal(race.status, 409);
  assert.equal(historyOf(other).length, 1);
});

test('simulasi ditolak: batas bayar lewat, pesanan dibatalkan, Bayar di Toko, milik orang lain, nomor rusak', async () => {
  const late = await place();
  paymentOf(late).expiredAt = new Date(NOW.getTime() - 1000);
  const cancelled = await place();
  orderRow(cancelled).orderStatus = 'dibatalkan';
  const store = await place('1', { method_code: 'pay_at_store' });
  const others = await place('2');
  const before = snapshot();

  assert.deepEqual(Object.values((await simulate(late)).json).slice(1), ['Batas waktu pembayaran sudah lewat.']);
  assert.equal((await simulate(late)).status, 409);
  assert.equal((await simulate(cancelled)).status, 409);
  assert.equal((await simulate(store)).status, 409);
  const foreign = await simulate(others);
  assert.deepEqual([foreign.status, foreign.json.message], [404, 'Pesanan tidak ditemukan.']);
  assert.equal((await simulate('OVC-xx')).json.code, 'INVALID_ID');
  assert.equal(snapshot(), before);
});

test('simulasi ditolak di NODE_ENV=production (bukan payment gateway sungguhan)', async () => {
  const number = await place();
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { status, json } = await simulate(number);
    assert.deepEqual([status, json.message], [403, 'Simulasi hanya tersedia di mode development']);
  } finally {
    process.env.NODE_ENV = previous;
  }
  assert.equal(orderRow(number).orderStatus, 'menunggu_pembayaran');
});

test('ganti metode online → online: kode bayar baru, batas bayar & nominal tetap, status tetap Menunggu', async () => {
  const number = await place();
  const { expiredAt, amount } = paymentOf(number);

  const { status, json } = await changeMethod(number, 'bca_va');

  assert.equal(status, 200);
  assert.deepEqual(json.data, { order_number: number, payment_option: 'online' });
  assert.equal(paymentOf(number).methodCode, 'bca_va');
  assert.match(paymentOf(number).paymentCode, /^8808\d{10}$/);
  assert.equal(paymentOf(number).gatewayRef, `SIM-${number}`);
  assert.equal(paymentOf(number).expiredAt.getTime(), expiredAt.getTime());
  assert.equal(paymentOf(number).amount, amount);
  assert.equal(orderRow(number).orderStatus, 'menunggu_pembayaran');
  assert.equal(historyOf(number).length, 1);
});

test('ganti ke Bayar di Toko (BR-05): pickup semua ready → Dikonfirmasi + riwayat; pre-order/delivery ditolak', async () => {
  const number = await place();
  const { json } = await changeMethod(number, 'pay_at_store');
  assert.deepEqual(json.data, { order_number: number, payment_option: 'pay_at_store' });
  assert.equal(orderRow(number).paymentOption, 'pay_at_store');
  assert.equal(orderRow(number).orderStatus, 'dikonfirmasi');
  assert.equal(orderRow(number).paymentStatus, 'unpaid');
  assert.equal(paymentOf(number).paymentCode, null);
  assert.equal(paymentOf(number).gatewayRef, null);
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n], ['dikonfirmasi', 1n]]);

  const preorder = await place('1', { items: [{ cart_item_id: 'c1', product_id: '3', quantity: 1 }], ready_date: dayKey(1) });
  const delivery = await place('1', { fulfillment: 'delivery', address_id: '10' });
  const before = snapshot();
  for (const target of [preorder, delivery]) {
    const res = await changeMethod(target, 'pay_at_store');
    assert.deepEqual([res.status, res.json.message], [400, 'Tidak tersedia untuk pre-order dan delivery']);
  }
  assert.equal(snapshot(), before);
});

test('ganti metode ditolak: metode nonaktif/kosong, sudah lunas, lewat batas, milik orang lain', async () => {
  const number = await place();
  const foreign = await place('2');
  const before = snapshot();

  assert.equal((await changeMethod(number, 'ovo')).json.message, 'Pilih metode pembayaran.');
  assert.equal((await call('PATCH', `/orders/${number}/payment`, tokenFor('1'), {})).status, 400);
  assert.equal((await changeMethod(foreign, 'bca_va')).status, 404);
  assert.equal(snapshot(), before);

  paymentOf(number).expiredAt = new Date(NOW.getTime() - 1000);
  assert.equal((await changeMethod(number, 'bca_va')).json.message, 'Batas waktu pembayaran sudah lewat.');

  const paid = await place();
  await simulate(paid);
  assert.deepEqual([(await changeMethod(paid, 'bca_va')).status, paymentOf(paid).methodCode], [409, 'qris']);
});

test('error database → 500 dan perubahan dibatalkan', async (t) => {
  t.mock.method(console, 'error', () => {});
  const number = await place();
  const before = snapshot();

  db.failOn = 'order.update';
  assert.deepEqual((await simulate(number)).json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
  assert.equal(snapshot(), before);

  db.failOn = 'payment.update';
  assert.equal((await changeMethod(number, 'pay_at_store')).status, 500);
  assert.equal(snapshot(), before);
});
