// Step 6.5 C1 · FR-18 · SPEC §4 — notifikasi lewat HTTP pada setiap jalur perubahan status pelanggan:
// checkout (online & Bayar di Toko), simulasi lunas, ganti metode, batal (+ poin refund), dan bonus ulasan.
// Diperiksa: tepat 1 riwayat + 1 notifikasi per perubahan status, notifikasi poin sesuai transaksi sumbernya,
// rollback penuh (tanpa notifikasi & tanpa email) saat database gagal, dan email hanya dicetak setelah commit.
// Prisma dipalsukan (helpers/orderDb.js) — TIDAK membuktikan locking InnoDB (lihat tests-mysql/11-notifications).

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
let emails;
let emailsAtNotificationWrite;

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
  emailsAtNotificationWrite = [];
  t.mock.method(console, 'info', (line) => { if (String(line).startsWith('[DEV EMAIL]')) emails.push(line); });
  // Catat berapa email yang sudah tercetak saat notifikasi DITULIS (di dalam transaksi) — harus selalu 0 baru
  const create = fakePrisma.notification.create;
  fakePrisma.notification.create = async (args) => {
    emailsAtNotificationWrite.push(emails.length);
    return create(args);
  };
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
const orderBody = (overrides = {}) => ({
  items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2 }], fulfillment: 'pickup', address_id: null,
  ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
});
const place = async (overrides) => {
  const { status, json } = await call('POST', '/orders', tokenFor('1'), orderBody(overrides));
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.order_number;
};
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);
const noticesOf = (number) => db.t.notifications.filter((n) => n.orderId === orderRow(number).orderId);
const brief = (rows) => rows.map((n) => [n.type, n.title, n.body]);
const snapshot = () => JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
const emailFor = (title, body) => `[DEV EMAIL] Kepada: anisa@example.com · ${title} — ${body}`;

/** Setiap notifikasi ditulis sebelum email apa pun tercetak (email hanya setelah commit) */
const assertEmailsOnlyAfterCommit = () => assert.ok(emailsAtNotificationWrite.every((count) => count === 0), 'email tercetak sebelum commit');

// ── Checkout ─────────────────────────────────────────────────────────────────────────────────────

test('checkout online: 1 riwayat + 1 notifikasi "Pesanan dibuat" untuk pemilik, email setelah commit', async () => {
  const number = await place();
  const order = orderRow(number);
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n]]);
  assert.deepEqual(noticesOf(number).map((n) => [n.userId, n.type, n.title, n.body, n.isRead]), [[
    1n, 'order_status', 'Pesanan dibuat',
    `Pesanan ${number} menunggu pembayaran. Selesaikan pembayaran sebelum batas waktu.`, false,
  ]]);
  assert.equal(noticesOf(number)[0].createdAt.getTime(), NOW.getTime());
  assert.equal(db.t.notifications.length, 1, 'redeem/stok/voucher tidak menambah notifikasi');
  assert.deepEqual(emails, [emailFor('Pesanan dibuat', noticesOf(number)[0].body)]);
  assertEmailsOnlyAfterCommit();
  // Riwayat lalu notifikasi, setelah kunci users (lockRows) — tidak ada kunci baru
  const ops = db.ops.filter((op) => /^lock:users|orderStatusHistory|notification/.test(op));
  assert.deepEqual(ops, ['lock:users', 'orderStatusHistory.create', 'notification.create']);
  assert.equal(order.orderStatus, 'menunggu_pembayaran');
});

test('checkout Bayar di Toko: status awal Dikonfirmasi → 1 riwayat + notifikasi "Pesanan dikonfirmasi"', async () => {
  const number = await place({ method_code: 'pay_at_store' });
  assert.deepEqual(historyOf(number).map((h) => h.status), ['dikonfirmasi']);
  assert.deepEqual(brief(noticesOf(number)), [[
    'order_status', 'Pesanan dikonfirmasi', `Pesanan ${number} sudah kami terima dan akan segera diproses.`,
  ]]);
  assert.equal(emails.length, 1);
});

for (const failOn of ['orderStatusHistory.create', 'notification.create']) {
  test(`checkout: ${failOn} gagal → 500, rollback penuh (tanpa pesanan, stok, riwayat, notifikasi) & tanpa email`, async () => {
    const before = snapshot();
    db.failOn = failOn;
    const res = await call('POST', '/orders', tokenFor('1'), orderBody({ use_points: true }));
    assert.equal(res.status, 500);
    assert.equal(snapshot(), before);
    assert.deepEqual(emails, []);
  });
}

// ── Pembayaran ───────────────────────────────────────────────────────────────────────────────────

test('simulasi lunas: +1 riwayat (sistem) + 1 notifikasi Dikonfirmasi; simulasi ulang 409 tanpa tambahan', async () => {
  const number = await place();
  emails.length = 0;
  const res = await call('POST', `/payments/${number}/simulate-paid`, tokenFor('1'));
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data, { order_number: number });
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n], ['dikonfirmasi', null]]);
  assert.deepEqual(noticesOf(number).map((n) => n.title), ['Pesanan dibuat', 'Pesanan dikonfirmasi']);
  assert.deepEqual(emails, [emailFor('Pesanan dikonfirmasi', `Pesanan ${number} sudah kami terima dan akan segera diproses.`)]);

  const again = await call('POST', `/payments/${number}/simulate-paid`, tokenFor('1'));
  assert.equal(again.status, 409);
  assert.equal(historyOf(number).length, 2);
  assert.equal(noticesOf(number).length, 2);
  assert.equal(emails.length, 1);
  assertEmailsOnlyAfterCommit();
});

test('simulasi lunas: notifikasi gagal ditulis → 500, pembayaran tetap pending, tanpa riwayat/notifikasi/email baru', async () => {
  const number = await place();
  emails.length = 0;
  const before = snapshot();
  db.failOn = 'notification.create';
  assert.equal((await call('POST', `/payments/${number}/simulate-paid`, tokenFor('1'))).status, 500);
  assert.equal(snapshot(), before);
  assert.equal(orderRow(number).orderStatus, 'menunggu_pembayaran');
  assert.deepEqual(emails, []);
});

test('ganti metode: online → online tanpa notifikasi; → Bayar di Toko +1 riwayat (pelanggan) + 1 notifikasi', async () => {
  const number = await place();
  emails.length = 0;
  assert.equal((await call('PATCH', `/orders/${number}/payment`, tokenFor('1'), { method_code: 'bca_va' })).status, 200);
  assert.equal(historyOf(number).length, 1);
  assert.equal(noticesOf(number).length, 1);
  assert.deepEqual(emails, []);

  const res = await call('PATCH', `/orders/${number}/payment`, tokenFor('1'), { method_code: 'pay_at_store' });
  assert.deepEqual(res.json.data, { order_number: number, payment_option: 'pay_at_store' });
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy]), [['menunggu_pembayaran', 1n], ['dikonfirmasi', 1n]]);
  assert.deepEqual(noticesOf(number).map((n) => n.title), ['Pesanan dibuat', 'Pesanan dikonfirmasi']);
  assert.equal(emails.length, 1);
  // Riwayat & notifikasi SEBELUM kunci S metode (urutan kunci T2 Step 6.4.10)
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  const methodLock = db.locks.findIndex((l) => /FROM payment_methods WHERE method_code = \? FOR SHARE/.test(l.sql));
  assert.ok(methodLock >= 0, 'kunci S metode diambil');
  assert.ok(tail.includes('notification.create') && tail.indexOf('notification.create') < tail.lastIndexOf('queryRaw'));
  assertEmailsOnlyAfterCommit();
});

test('ganti ke Bayar di Toko: metode dinonaktifkan selagi menunggu kunci → 409, riwayat & notifikasi di-rollback, tanpa email', async () => {
  const number = await place();
  emails.length = 0;
  let noticesAtMethodLock = null;
  const change = (t) => { t.paymentMethods.find((m) => m.methodCode === 'pay_at_store').isActive = false; };
  db.hooks.whileWaitingMethodLock = () => { noticesAtMethodLock = noticesOf(number).length; change(db.t); db.afterRollback = [change]; };
  const res = await call('PATCH', `/orders/${number}/payment`, tokenFor('1'), { method_code: 'pay_at_store' });
  assert.equal(res.status, 409);
  assert.equal(noticesAtMethodLock, 2, 'notifikasi sudah ditulis sebelum kunci metode');
  assert.equal(noticesOf(number).length, 1, 'notifikasi Dikonfirmasi ikut di-rollback');
  assert.equal(historyOf(number).length, 1);
  assert.equal(orderRow(number).orderStatus, 'menunggu_pembayaran');
  assert.deepEqual(emails, []);
});

// ── Pembatalan pelanggan ─────────────────────────────────────────────────────────────────────────

test('batal dengan poin ditukar: notifikasi Dibatalkan (+alasan) lalu poin refund; batal ulang 409 tanpa tambahan', async () => {
  const number = await place({ use_points: true });
  const pointsUsed = orderRow(number).pointsUsed;
  assert.ok(pointsUsed > 0);
  emails.length = 0;

  const res = await call('PATCH', `/orders/${number}/cancel`, tokenFor('1'), { reason: 'Salah pilih tanggal' });
  assert.equal(res.status, 200);
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy, h.note]), [
    ['menunggu_pembayaran', 1n, null], ['dibatalkan', 1n, 'Salah pilih tanggal'],
  ]);
  const refundBody = `Poin bertambah dari pembatalan pesanan ${number}.`;
  assert.deepEqual(brief(noticesOf(number)).slice(1), [
    ['order_status', 'Pesanan dibatalkan', `Pesanan ${number} dibatalkan. Alasan: Salah pilih tanggal`],
    ['points', `+${pointsUsed.toLocaleString('id-ID')} poin`, refundBody],
  ]);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 1);
  assert.equal(emails.length, 2);
  // Urutan pernyataan (bukan bukti locking — lihat tests-mysql/12): riwayat & notifikasi (FK users → S) SEBELUM
  // payment.updateMany (F-C1-1, gap payments_order_id_fkey) dan SEBELUM stok dikembalikan (C4, daily_stocks X)
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  assert.ok(tail.includes('payment.updateMany') && tail.includes('executeRaw'));
  assert.ok(tail.indexOf('orderStatusHistory.create') < tail.indexOf('payment.updateMany'), 'riwayat sebelum UPDATE payments');
  assert.ok(tail.lastIndexOf('notification.create') < tail.indexOf('payment.updateMany'), 'notifikasi sebelum UPDATE payments');
  assert.ok(tail.indexOf('payment.updateMany') < tail.indexOf('executeRaw'));

  assert.equal((await call('PATCH', `/orders/${number}/cancel`, tokenFor('1'), { reason: 'lagi' })).status, 409);
  assert.equal(noticesOf(number).length, 3);
  assert.equal(emails.length, 2);
  assertEmailsOnlyAfterCommit();
});

test('batal tanpa poin: hanya notifikasi status (tanpa notifikasi poin)', async () => {
  const number = await place();
  await call('PATCH', `/orders/${number}/cancel`, tokenFor('1'), { reason: 'Berubah pikiran' });
  assert.deepEqual(noticesOf(number).map((n) => n.type), ['order_status', 'order_status']);
});

test('batal: notifikasi poin gagal ditulis → 500, stok/voucher/poin/riwayat/notifikasi tidak berubah, tanpa email', async () => {
  const number = await place({ use_points: true, voucher_code: 'HEMAT10' });
  emails.length = 0;
  const before = snapshot();
  let writes = 0;
  const create = fakePrisma.notification.create;
  fakePrisma.notification.create = async (args) => {
    writes += 1;
    if (writes === 2) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    return create(args);
  };
  assert.equal((await call('PATCH', `/orders/${number}/cancel`, tokenFor('1'), { reason: 'x' })).status, 500);
  assert.equal(snapshot(), before);
  assert.deepEqual(emails, []);
});

// ── Bonus ulasan ─────────────────────────────────────────────────────────────────────────────────

test('ulasan: notifikasi poin review_bonus (+20, tautan pesanan); ulasan ganda 409 tanpa notifikasi kedua', async () => {
  const number = await place();
  orderRow(number).orderStatus = 'selesai';
  const [item] = db.t.orderItems.filter((i) => i.orderId === orderRow(number).orderId).map((i) => String(i.orderItemId));
  emails.length = 0;
  const body = { order_item_id: item, rating: 5, tags: [], comment: 'Enak' };

  const res = await call('POST', `/orders/${number}/reviews`, tokenFor('1'), body);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.deepEqual(noticesOf(number).map((n) => [n.type, n.title, n.body]).slice(1), [
    ['points', '+20 poin', `Poin bertambah dari ulasan pesanan ${number}.`],
  ]);
  assert.equal(historyOf(number).length, 1, 'ulasan tidak mengubah status');
  assert.deepEqual(emails, [emailFor('+20 poin', `Poin bertambah dari ulasan pesanan ${number}.`)]);

  assert.equal((await call('POST', `/orders/${number}/reviews`, tokenFor('1'), body)).status, 409);
  assert.equal(noticesOf(number).length, 2);
  assert.equal(emails.length, 1);
  assertEmailsOnlyAfterCommit();
});

test('ulasan: notifikasi gagal ditulis → 500, ulasan & bonus di-rollback, tanpa email', async () => {
  const number = await place();
  orderRow(number).orderStatus = 'selesai';
  const [item] = db.t.orderItems.filter((i) => i.orderId === orderRow(number).orderId).map((i) => String(i.orderItemId));
  emails.length = 0;
  const before = snapshot();
  db.failOn = 'notification.create';
  const res = await call('POST', `/orders/${number}/reviews`, tokenFor('1'), { order_item_id: item, rating: 4, tags: [], comment: null });
  assert.equal(res.status, 500);
  assert.equal(snapshot(), before);
  assert.deepEqual(emails, []);
});
