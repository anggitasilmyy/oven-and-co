// Step 6.5 C4 · FR-14 · NFR-05 · BR-06 — services/paymentGateway.service.js (fungsi internal notifikasi gateway) dan
// rute simulasi yang memakainya. Hasil terstruktur, validasi gateway_ref/nominal (DECIMAL)/metode, batas expired_at,
// idempotensi, rollback, email setelah commit, urutan pernyataan, kontrak HTTP 200/403/404/409 tetap.
// Prisma dipalsukan (helpers/orderDb.js) — TIDAK membuktikan locking InnoDB (tests-mysql/15-payment-gateway).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { Prisma } = require('@prisma/client');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const { isSameAmount, evaluateGatewayNotification, applyGatewayPayment } = require('../src/services/paymentGateway.service');

const NOW = new Date('2026-10-20T01:00:00Z');
const EXPIRES = new Date(NOW.getTime() + 30 * 60000);
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);

// ── Fungsi murni ─────────────────────────────────────────────────────────────────────────────────

const order = (o = {}) => ({ orderStatus: 'menunggu_pembayaran', paymentStatus: 'unpaid', paymentOption: 'online', ...o });
const payment = (p = {}) => ({
  status: 'pending', gatewayRef: 'SIM-OVC-261020-001', amount: new Prisma.Decimal('56500.00'), expiredAt: EXPIRES,
  method: { methodGroup: 'qris' }, ...p,
});
const notif = (n = {}) => ({ gatewayRef: 'SIM-OVC-261020-001', amount: '56500.00', now: NOW, ...n });
const at = (ms) => new Date(EXPIRES.getTime() + ms);

test('batas expired_at: sebelum & tepat diterima; 1 ms sesudah → EXPIRED (sama dengan BR-06)', () => {
  assert.equal(evaluateGatewayNotification(order(), payment(), notif({ now: at(-1000) })), null);
  assert.equal(evaluateGatewayNotification(order(), payment(), notif({ now: at(0) })), null);
  assert.equal(evaluateGatewayNotification(order(), payment(), notif({ now: at(1) })), 'EXPIRED');
});

test('NOT_PENDING: lunas, dibatalkan, dikonfirmasi, payment paid/expired/failed/refunded, tanpa payment', () => {
  const cases = [
    order({ paymentStatus: 'paid', orderStatus: 'dikonfirmasi' }), order({ orderStatus: 'dibatalkan' }),
    order({ orderStatus: 'dikonfirmasi', paymentOption: 'pay_at_store' }), order({ paymentStatus: 'refunded' }),
  ];
  for (const o of cases) assert.equal(evaluateGatewayNotification(o, payment(), notif()), 'NOT_PENDING', JSON.stringify(o));
  for (const status of ['paid', 'expired', 'failed', 'refunded']) {
    assert.equal(evaluateGatewayNotification(order(), payment({ status }), notif()), 'NOT_PENDING', status);
  }
  assert.equal(evaluateGatewayNotification(order(), null, notif()), 'NOT_PENDING');
  // Status diperiksa lebih dulu: notifikasi kedaluwarsa untuk pesanan yang sudah lunas tetap NOT_PENDING
  assert.equal(evaluateGatewayNotification(order({ paymentStatus: 'paid' }), payment(), notif({ now: at(60000) })), 'NOT_PENDING');
});

test('INVALID_NOTIFICATION: gateway_ref, nominal, metode bukan gateway, opsi bukan online', () => {
  const invalid = [
    ['gateway_ref lain', payment(), notif({ gatewayRef: 'SIM-OVC-261020-002' })],
    ['gateway_ref kosong', payment(), notif({ gatewayRef: null })],
    ['payment tanpa gateway_ref', payment({ gatewayRef: null }), notif({ gatewayRef: null })],
    ['nominal lain', payment(), notif({ amount: '56500.01' })],
    ['nominal kosong', payment(), notif({ amount: null })],
    ['nominal bukan angka', payment(), notif({ amount: 'abc' })],
    ['nominal NaN', payment(), notif({ amount: Number.NaN })],
    ['metode Bayar di Toko', payment({ method: { methodGroup: 'store' } }), notif()],
    ['metode tidak dimuat', payment({ method: null }), notif()],
  ];
  for (const [label, p, n] of invalid) assert.equal(evaluateGatewayNotification(order(), p, n), 'INVALID_NOTIFICATION', label);
  assert.equal(evaluateGatewayNotification(order({ paymentOption: 'pay_at_store' }), payment(), notif()), 'INVALID_NOTIFICATION');
  // Keabsahan diperiksa sebelum batas waktu
  assert.equal(evaluateGatewayNotification(order(), payment(), notif({ gatewayRef: 'x', now: at(60000) })), 'INVALID_NOTIFICATION');
  for (const group of ['qris', 'ewallet', 'va']) {
    assert.equal(evaluateGatewayNotification(order(), payment({ method: { methodGroup: group } }), notif()), null, group);
  }
});

test('nominal DECIMAL presisi: skala berbeda sama; selisih di luar presisi float tetap berbeda', () => {
  assert.equal(isSameAmount('56500', new Prisma.Decimal('56500.00')), true);
  assert.equal(isSameAmount(56500, '56500.00'), true);
  assert.equal(isSameAmount(new Prisma.Decimal('0.30'), '0.3'), true);
  assert.equal(isSameAmount('56500.001', '56500.00'), false);
  // Number('…7.01') === Number('…7.02') (float) — perbandingan DECIMAL harus membedakannya
  assert.equal(Number('12345678901234567.01') === Number('12345678901234567.02'), true);
  assert.equal(isSameAmount('12345678901234567.01', '12345678901234567.02'), false);
  assert.equal(isSameAmount(0.1 + 0.2, '0.3'), false, 'hasil float tidak eksak ditolak, bukan dibulatkan');
});

test('applyGatewayPayment: tidak berlaku → tanpa satu pun penulisan; berlaku → payment (PK), order, riwayat+notifikasi', async () => {
  const writes = [];
  const tx = {
    payment: { update: async (a) => writes.push(['payment', a.where]) },
    order: { update: async (a) => writes.push(['order', a.where, a.data]) },
    orderStatusHistory: { create: async (a) => writes.push(['history', a.data.status, a.data.changedBy]) },
    notification: { create: async (a) => writes.push(['notification', a.data.title]) },
  };
  const base = { orderId: 7n, orderNumber: 'OVC-261020-001', userId: 1n, pickupCode: null, ...order() };
  const p = { paymentId: 70n, ...payment() };

  assert.deepEqual(await applyGatewayPayment(tx, { ...base, payments: [p] }, notif({ amount: '1' })), { applied: false, reason: 'INVALID_NOTIFICATION' });
  assert.deepEqual(await applyGatewayPayment(tx, { ...base, payments: [p] }, notif({ now: at(1) })), { applied: false, reason: 'EXPIRED' });
  assert.deepEqual(await applyGatewayPayment(tx, { ...base, payments: [] }, notif()), { applied: false, reason: 'NOT_PENDING' });
  assert.deepEqual(writes, []);

  const result = await applyGatewayPayment(tx, { ...base, payments: [p] }, notif());
  assert.equal(result.applied, true);
  assert.equal(result.notices[0].title, 'Pesanan dikonfirmasi');
  assert.deepEqual(writes, [
    ['payment', { paymentId: 70n }],
    ['order', { orderId: 7n }, { paymentStatus: 'paid', orderStatus: 'dikonfirmasi' }],
    ['history', 'dikonfirmasi', null],
    ['notification', 'Pesanan dikonfirmasi'],
  ]);
});

// ── Rute simulasi memakai fungsi gateway ──────────────────────────────────────────────────────────

let db;
let server;
let baseUrl;
let emails;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach((t) => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
  emails = [];
  t.mock.method(console, 'info', (line) => { if (String(line).startsWith('[DEV EMAIL]')) emails.push(String(line)); });
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, path, sub, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(sub)}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const place = async (overrides = {}, sub = '1') => {
  const res = await call('POST', '/orders', sub, {
    items: [{ cart_item_id: 'c1', product_id: '1', quantity: 1 }], fulfillment: 'pickup', address_id: null,
    ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.data.order_number;
};
const simulate = (number, sub = '1') => call('POST', `/payments/${number}/simulate-paid`, sub);
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const paymentOf = (number) => db.t.payments.find((p) => p.orderId === orderRow(number).orderId);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);
const noticesOf = (number) => db.t.notifications.filter((n) => n.orderId === orderRow(number).orderId);
const snapshot = () => JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));

test('rute 200: lunas lewat fungsi gateway; urutan orders X → payments (PK) → orders → riwayat → notifikasi; email setelah commit', async () => {
  const number = await place();
  emails.length = 0;
  const res = await simulate(number);
  assert.deepEqual([res.status, res.json], [200, { status: 'success', data: { order_number: number } }]);
  assert.deepEqual([orderRow(number).paymentStatus, orderRow(number).orderStatus, paymentOf(number).status], ['paid', 'dikonfirmasi', 'paid']);
  assert.equal(paymentOf(number).paidAt.getTime(), NOW.getTime());
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n], ['dikonfirmasi', null]]);
  assert.deepEqual(noticesOf(number).map((n) => n.title), ['Pesanan dibuat', 'Pesanan dikonfirmasi']);
  assert.equal(emails.length, 1);
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  const i = (op) => tail.indexOf(op);
  assert.equal(tail[1], 'lock:orders');
  assert.ok(i('payment.update') > 1 && i('orderStatusHistory.create') > i('payment.update') && i('notification.create') > i('orderStatusHistory.create'), tail.join(' → '));
});

test('idempoten: pemicu kedua 409 pesan lama tanpa riwayat/notifikasi/paid_at baru', async () => {
  const number = await place();
  assert.equal((await simulate(number)).status, 200);
  const once = snapshot();
  emails.length = 0;
  for (let k = 0; k < 3; k += 1) {
    const again = await simulate(number);
    assert.deepEqual([again.status, again.json.message], [409, 'Pesanan tidak lagi menunggu pembayaran.']);
  }
  assert.equal(snapshot(), once);
  assert.deepEqual(emails, []);
});

test('409 EXPIRED (pesan lama) saat batas lewat — tanpa penulisan; pesanan dibatalkan / Bayar di Toko → 409 NOT_PENDING', async () => {
  const number = await place();
  paymentOf(number).expiredAt = new Date(NOW.getTime() - 1);
  const before = snapshot();
  const res = await simulate(number);
  assert.deepEqual([res.status, res.json.message], [409, 'Batas waktu pembayaran sudah lewat.']);
  assert.equal(snapshot(), before);

  const store = await place({ method_code: 'pay_at_store' });
  assert.deepEqual([(await simulate(store)).status, (await simulate(store)).json.message], [409, 'Pesanan tidak lagi menunggu pembayaran.']);
  const cancelled = await place();
  orderRow(cancelled).orderStatus = 'dibatalkan';
  assert.equal((await simulate(cancelled)).status, 409);
});

test('409 INVALID_NOTIFICATION bila data pembayaran sendiri tidak konsisten (metode bukan gateway) — tanpa penulisan', async () => {
  const number = await place();
  paymentOf(number).methodCode = 'pay_at_store'; // anomali data: opsi online tetapi metode Bayar di Toko
  const before = snapshot();
  const res = await simulate(number);
  assert.deepEqual([res.status, res.json.message], [409, 'Notifikasi pembayaran tidak valid.']);
  assert.equal(snapshot(), before);
});

test('production 403 tanpa transaksi; pesanan pelanggan lain 404; nominal/status dari klien diabaikan', async () => {
  const number = await place();
  const opsBefore = db.ops.length;
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const prod = await simulate(number);
    assert.deepEqual([prod.status, prod.json.message], [403, 'Simulasi hanya tersedia di mode development']);
    assert.ok(!db.ops.slice(opsBefore).includes('tx:begin'), 'tanpa transaksi');
    assert.equal(paymentOf(number).status, 'pending');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  assert.equal((await simulate(number, '2')).status, 404);
  const res = await call('POST', `/payments/${number}/simulate-paid`, '1', { amount: 1, status: 'paid', gateway_ref: 'x' });
  assert.equal(res.status, 200);
  assert.equal(paymentOf(number).status, 'paid');
});

test('rollback: notifikasi gagal ditulis → 500, payment tetap pending, tanpa riwayat & email', async () => {
  const number = await place();
  emails.length = 0;
  const before = snapshot();
  db.failOn = 'notification.create';
  assert.equal((await simulate(number)).status, 500);
  db.failOn = null;
  assert.equal(snapshot(), before);
  assert.deepEqual(emails, []);
  assert.equal((await simulate(number)).status, 200, 'berhasil setelah pulih');
});

test('status berubah selagi menunggu kunci pesanan (BR-06 / batal pelanggan / ganti ke Bayar di Toko commit lebih dulu) → 409, tanpa penulisan', async () => {
  for (const change of [
    (o, p) => { o.orderStatus = 'dibatalkan'; p.status = 'expired'; },
    (o, p) => { o.orderStatus = 'dibatalkan'; p.status = 'failed'; },
    (o, p) => { o.orderStatus = 'dikonfirmasi'; o.paymentOption = 'pay_at_store'; p.methodCode = 'pay_at_store'; },
  ]) {
    const number = await place();
    db.hooks.whileWaitingOrderLock = () => { change(orderRow(number), paymentOf(number)); db.hooks.whileWaitingOrderLock = null; };
    const before = historyOf(number).length;
    const res = await simulate(number);
    assert.deepEqual([res.status, res.json.message], [409, 'Pesanan tidak lagi menunggu pembayaran.']);
    assert.equal(historyOf(number).length, before);
    assert.notEqual(paymentOf(number).status, 'paid');
  }
});
