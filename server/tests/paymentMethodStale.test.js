// T2 (ROADMAP 6.4.10 · FR-14 · FR-15 · BR-05 · C-14 · C-15 · AD-11): metode bayar diperiksa ulang DI DALAM transaksi.
//   - Checkout: metode terpilih dibaca ulang setelah kunci store_settings (penulis payment_methods — AD-11 — mengunci
//     store_settings lebih dulu, jadi nilainya final sampai commit). Nonaktif → 409 + rollback penuh.
//   - Ganti metode (PATCH /api/orders/:no/payment): baris metode tujuan dikunci FOR SHARE lalu diperiksa. Nonaktif → 409
//     + rollback penuh (termasuk perubahan pesanan & riwayat Bayar di Toko). Riwayat ditulis SEBELUM kunci metode.
// Kondisi diuji: normal (metode aktif), metode sudah nonaktif sebelum request (400 lama tetap), dan Owner menonaktifkan
// metode selagi request berjalan (kait whileWaitingSettingsLock / whileWaitingMethodLock di tests/helpers/orderDb.js).
// BATAS BUKTI: fake membuktikan logika; perilaku InnoDB nyata di tests-mysql/10-payment-method-active.it.test.js.

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
const TODAY = dayKey(0);
const UNAVAILABLE = 'Metode pembayaran baru saja dinonaktifkan. Pilih metode lain lalu coba lagi.';

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
async function call(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor('1')}` }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const place = (overrides = {}) => call('POST', '/orders', {
  items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2, note: '' }], fulfillment: 'pickup', address_id: null,
  ready_date: TODAY, time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
});
const changeMethod = (number, methodCode) => call('PATCH', `/orders/${number}/payment`, { method_code: methodCode });
const tables = () => JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
const methodRow = (code) => db.t.paymentMethods.find((m) => m.methodCode === code);
const deactivate = (code) => (t) => { t.paymentMethods.find((m) => m.methodCode === code).isActive = false; };
/** Owner menonaktifkan metode & commit selagi request menunggu kunci `hook`; commit Owner tidak ikut di-rollback */
function ownerDeactivatesWhileWaiting(hook, code) {
  const change = deactivate(code);
  db.hooks[hook] = () => { change(db.t); db.afterRollback = [change]; db.hooks[hook] = null; };
  return change;
}
function expectedAfter(change) {
  const copy = JSON.parse(tables());
  change(copy);
  return JSON.stringify(copy);
}
async function placedOrder(overrides) {
  const res = await place(overrides);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.data.order_number;
}
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const paymentOf = (number) => db.t.payments.find((p) => p.orderId === orderRow(number).orderId);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);

// ── Checkout ──────────────────────────────────────────────────────────────────────────────────────

test('T2 checkout normal: metode aktif → 201; metode dibaca ulang SETELAH kunci store_settings', async () => {
  const res = await place({ method_code: 'bca_va' });
  assert.equal(res.status, 201);
  const ops = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  assert.ok(ops.indexOf('lock:store_settings') < ops.indexOf('paymentMethod.findUnique'), JSON.stringify(ops));
  assert.equal(db.t.payments.at(-1).methodCode, 'bca_va');
});

test('T2 checkout: metode sudah nonaktif sebelum request → 400 lama (Pilih metode pembayaran.), tanpa transaksi', async () => {
  const expected = expectedAfter(deactivate('bca_va'));
  methodRow('bca_va').isActive = false;
  const res = await place({ method_code: 'bca_va' });
  assert.deepEqual([res.status, res.json.message], [400, 'Pilih metode pembayaran.']);
  assert.ok(!db.ops.includes('tx:begin'), 'ditolak sebelum transaksi');
  assert.equal(tables(), expected, 'tanpa perubahan selain status metode');
});

for (const [label, overrides, code] of [
  ['online (QRIS) + voucher + poin', { voucher_code: 'HEMAT10', use_points: true, items: [{ cart_item_id: 'c1', product_id: '1', quantity: 4, note: '' }] }, 'qris'],
  ['Bayar di Toko', { method_code: 'pay_at_store' }, 'pay_at_store'],
  ['delivery online (VA)', { method_code: 'bca_va', fulfillment: 'delivery', address_id: '10' }, 'bca_va'],
]) {
  test(`T2 checkout ${label}: Owner menonaktifkan metode selagi checkout menunggu kunci → 409 + rollback penuh`, async () => {
    const change = ownerDeactivatesWhileWaiting('whileWaitingSettingsLock', code);
    const expected = expectedAfter(change);
    const res = await place(overrides);
    assert.deepEqual([res.status, res.json.message], [409, UNAVAILABLE]);
    assert.equal(tables(), expected, 'tanpa pesanan, pembayaran, stok, klaim voucher, atau poin');
    assert.equal(methodRow(code).isActive, false, 'perubahan Owner tetap tersimpan');
  });
}

// ── Ganti metode pembayaran ──────────────────────────────────────────────────────────────────────

test('T2 ganti metode normal: metode aktif → 200; kunci pesanan lalu kunci S baris metode tujuan', async () => {
  const number = await placedOrder();
  const res = await changeMethod(number, 'bca_va');
  assert.equal(res.status, 200);
  assert.equal(paymentOf(number).methodCode, 'bca_va');
  const tail = db.locks.slice(-2).map((l) => l.sql.replace(/\s+/g, ' '));
  assert.match(tail[0], /FROM orders WHERE order_number = \? FOR UPDATE/);
  assert.match(tail[1], /FROM payment_methods WHERE method_code = \? FOR SHARE/);
  assert.deepEqual(db.locks.at(-1).values, ['bca_va']);
});

test('T2 ganti metode: metode sudah nonaktif sebelum request → 400 lama, tanpa perubahan', async () => {
  const number = await placedOrder();
  methodRow('bca_va').isActive = false;
  const before = tables();
  const res = await changeMethod(number, 'bca_va');
  assert.deepEqual([res.status, res.json.message], [400, 'Pilih metode pembayaran.']);
  assert.equal(tables(), before);
});

test('T2 ganti metode online → online: Owner menonaktifkan metode tujuan selagi request berjalan → 409, pembayaran tetap', async () => {
  const number = await placedOrder();
  const change = ownerDeactivatesWhileWaiting('whileWaitingMethodLock', 'bca_va');
  const expected = expectedAfter(change);
  const res = await changeMethod(number, 'bca_va');
  assert.deepEqual([res.status, res.json.message], [409, UNAVAILABLE]);
  assert.equal(tables(), expected);
  assert.equal(paymentOf(number).methodCode, 'qris');
});

test('T2 ganti ke Bayar di Toko: riwayat ditulis SEBELUM kunci metode; metode dinonaktifkan → 409 & pesanan/riwayat di-rollback', async () => {
  const number = await placedOrder();
  let historiesAtMethodLock = null;
  const change = deactivate('pay_at_store');
  db.hooks.whileWaitingMethodLock = () => {
    historiesAtMethodLock = historyOf(number).length;
    change(db.t);
    db.afterRollback = [change];
  };
  const expected = expectedAfter(change);
  const res = await changeMethod(number, 'pay_at_store');
  assert.deepEqual([res.status, res.json.message], [409, UNAVAILABLE]);
  assert.equal(historiesAtMethodLock, 2, 'riwayat Dikonfirmasi sudah ditulis saat kunci metode diminta (urutan kunci T2)');
  assert.equal(tables(), expected);
  assert.deepEqual([orderRow(number).orderStatus, orderRow(number).paymentOption, historyOf(number).length], ['menunggu_pembayaran', 'online', 1]);
});

test('T2 ganti ke Bayar di Toko normal → 200, Dikonfirmasi + riwayat (perilaku lama tetap)', async () => {
  const number = await placedOrder();
  const res = await changeMethod(number, 'pay_at_store');
  assert.deepEqual(res.json.data, { order_number: number, payment_option: 'pay_at_store' });
  assert.deepEqual([orderRow(number).orderStatus, historyOf(number).length, paymentOf(number).methodCode], ['dikonfirmasi', 2, 'pay_at_store']);
});
