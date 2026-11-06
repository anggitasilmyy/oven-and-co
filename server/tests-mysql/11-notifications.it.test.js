// tests-mysql/11-notifications.it.test.js
// Step 6.5 C1 · FR-18 · BR-007 · SPEC §4 — notifikasi status & poin pada MySQL 8 sungguhan (InnoDB, bukan Prisma palsu).
// N1 rollback atomik: ganti ke Bayar di Toko menulis riwayat + notifikasi lalu metode dinonaktifkan selagi request
//    menunggu kunci S metode → 409; riwayat & notifikasi di-rollback; tidak ada salinan email di log server.
// N2 10 request Selesai bersamaan (AD-04) → 1 sukses; tepat 1 riwayat, 1 notifikasi status, 1 notifikasi poin, 1 earn.
// N3 10 simulasi lunas bersamaan → 1 sukses; tepat 1 riwayat & 1 notifikasi Dikonfirmasi.
// N4 5 pembatalan bersamaan (dengan poin ditukar) → 1 sukses; 1 refund, 1 notifikasi Dibatalkan, 1 notifikasi poin.
// N5 urutan kunci baru (orders X → users S pelanggan lewat FK notifikasi): admin mengubah status selagi checkout pelanggan
//    yang sama memegang users X → admin menunggu users, checkout lanjut store_settings & commit → 0 deadlock.
// N6 beban campuran × putaran: checkout + AD-04 + simulasi lunas + batal pelanggan yang sama bersamaan → tanpa 5xx,
//    0 deadlock, dan untuk setiap pesanan jumlah riwayat = jumlah notifikasi order_status.
//    N6 juga menangkap temuan F-C1-1 (ada sejak Step 6.3): sebelum urutan pembatalan diperbaiki, batal × checkout
//    pelanggan yang sama sesekali deadlock (`cancel 500`). Bukti deterministik: 12-cancel-checkout-lock-order.

const test = require('node:test');
const assert = require('node:assert/strict');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const {
  db, rows, holdTransaction, waitForAppLockWait, appHeldLocks, appLockWaits, innodbMetrics, latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique, prepareOrder, changeStatus, tally } = require('./helpers/fixtures');

const FILE = '11-notifications';
const ROUNDS = Number(process.env.C4_ROUNDS_N6 || 8);
let server;
let staff;
let owner;

test.before(async () => {
  server = await startServer(FILE);
  staff = await createUser('staf');
  owner = await createUser('owner');
});
test.after(async () => {
  await db.$executeRawUnsafe("UPDATE payment_methods SET is_active = 1 WHERE method_code = 'pay_at_store'");
  await server?.stop();
  await db.$disconnect();
});

/** Checkout pre-order pickup (produk 9) lewat HTTP asli */
async function placeOrder(customer, { usePoints = false } = {}) {
  const items = [{ cart_item_id: unique('ci'), product_id: '9', quantity: 1 }];
  const cart = await call(server, 'POST', '/api/cart', { userId: customer, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  const res = await call(server, 'POST', '/api/orders', {
    userId: customer,
    body: {
      items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date,
      time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: usePoints, method_code: 'qris',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.order_number;
}

const orderIdOf = async (number) => (await rows('SELECT order_id FROM orders WHERE order_number = ?', number))[0].order_id;
async function trail(number) {
  const id = await orderIdOf(number);
  const [h] = await rows('SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ?', id);
  const notes = await rows('SELECT type, title, body, user_id FROM notifications WHERE order_id = ? ORDER BY notification_id', id);
  const [o] = await rows('SELECT order_status, payment_status, payment_option, user_id FROM orders WHERE order_id = ?', id);
  return { histories: Number(h.n), notices: notes, statusNotices: notes.filter((n) => n.type === 'order_status').length, order: o };
}
const emailLines = (number, title) => server.readLog().split('\n')
  .filter((line) => line.startsWith('[DEV EMAIL]') && line.includes(number) && line.includes(`· ${title} —`));

test('N1 rollback: riwayat + notifikasi Bayar di Toko sudah ditulis, metode dinonaktifkan → 409, keduanya di-rollback, tanpa email', async () => {
  const customer = await createUser('customer');
  const number = await placeOrder(customer);
  // Semua item harus ready agar Bayar di Toko sah (BR-05): ubah item pesanan ini saja lewat SQL (penyiapan, bukan aksi diuji)
  const readyProduct = (await rows("SELECT product_id FROM products WHERE availability_type = 'ready' AND is_active = 1 ORDER BY product_id LIMIT 1"))[0].product_id;
  await db.$executeRawUnsafe('UPDATE order_items SET product_id = ? WHERE order_id = ?', readyProduct, await orderIdOf(number));
  const before = await trail(number);
  try {
    const methodTx = holdTransaction((tx) => tx.$queryRawUnsafe("SELECT method_code FROM payment_methods WHERE method_code = 'pay_at_store' FOR UPDATE"));
    await methodTx.ready;
    const pending = call(server, 'PATCH', `/api/orders/${number}/payment`, { userId: customer, body: { method_code: 'pay_at_store' } });
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'payment_methods');
    const conn = waits.find((w) => w.waiting_table === 'payment_methods').waiting_conn;
    const heldWhileWaiting = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.lock_mode}`);
    await methodTx.release((tx) => tx.$executeRawUnsafe("UPDATE payment_methods SET is_active = 0 WHERE method_code = 'pay_at_store'"));
    const res = await pending;
    await sleep(200);
    const after = await trail(number);
    record(FILE, 'N1', { status: res.status, heldWhileWaiting, before, after });
    assert.equal(res.status, 409);
    assert.ok(heldWhileWaiting.includes('notifications:IX'), `notifikasi sudah di-INSERT sebelum kunci metode: ${heldWhileWaiting}`);
    assert.ok(heldWhileWaiting.includes('order_status_histories:IX'));
    assert.deepEqual(after, before, 'status, riwayat, dan notifikasi kembali seperti semula');
    assert.deepEqual(emailLines(number, 'Pesanan dikonfirmasi'), [], 'tidak ada email untuk transaksi yang di-rollback');
    assert.equal(emailLines(number, 'Pesanan dibuat').length, 1, 'email checkout tercetak sekali setelah commit');
  } finally {
    await db.$executeRawUnsafe("UPDATE payment_methods SET is_active = 1 WHERE method_code = 'pay_at_store'");
  }
});

test('N2 10 request Selesai bersamaan → 1 sukses; tepat 1 riwayat, 1 notifikasi status, 1 notifikasi poin, 1 earn', async () => {
  const customer = await createUser('customer');
  const number = await placeOrder(customer);
  const { order_id: orderId, pickup_code: code } = await prepareOrder(number, 'siap_diambil');
  const before = await trail(number);
  const metricsBefore = await innodbMetrics();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => changeStatus(server, i % 2 ? owner : staff, number, {
    from: 'siap_diambil', to: 'selesai', pickup_code: code,
  })));
  await sleep(200);
  const after = await trail(number);
  const [earn] = await rows("SELECT COUNT(*) AS n, MAX(points) AS p FROM point_transactions WHERE order_id = ? AND type = 'earn'", orderId);
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  record(FILE, 'N2', { statuses: tally(results), before, after, earn, deadlocks });
  assert.deepEqual(tally(results), { 200: 1, 409: 9 });
  assert.equal(after.histories - before.histories, 1);
  assert.deepEqual(after.notices.slice(before.notices.length).map((n) => [n.type, n.title, String(n.user_id)]), [
    ['order_status', 'Pesanan selesai', String(customer)], ['points', `+${earn.p} poin`, String(customer)],
  ]);
  assert.equal(Number(earn.n), 1);
  assert.equal(emailLines(number, 'Pesanan selesai').length, 1);
  assert.equal(deadlocks, 0);
});

test('N3 10 simulasi lunas bersamaan → 1 sukses; tepat 1 riwayat & 1 notifikasi Dikonfirmasi', async () => {
  const customer = await createUser('customer');
  const number = await placeOrder(customer);
  const results = await Promise.all(Array.from({ length: 10 }, () => call(server, 'POST', `/api/payments/${number}/simulate-paid`, { userId: customer })));
  await sleep(200);
  const after = await trail(number);
  record(FILE, 'N3', { statuses: tally(results), after });
  assert.deepEqual(tally(results), { 200: 1, 409: 9 });
  assert.equal(after.histories, 2);
  assert.deepEqual(after.notices.map((n) => n.title), ['Pesanan dibuat', 'Pesanan dikonfirmasi']);
  assert.deepEqual([after.order.order_status, after.order.payment_status], ['dikonfirmasi', 'paid']);
  assert.equal(emailLines(number, 'Pesanan dikonfirmasi').length, 1);
});

test('N4 5 pembatalan bersamaan (poin ditukar) → 1 sukses; 1 refund, 1 notifikasi Dibatalkan, 1 notifikasi poin', async () => {
  const customer = await createUser('customer');
  await db.$executeRawUnsafe("INSERT INTO point_transactions (user_id, type, points, created_at) VALUES (?, 'earn', 200, NOW())", customer);
  const number = await placeOrder(customer, { usePoints: true });
  const orderId = await orderIdOf(number);
  const [{ points_used: pointsUsed }] = await rows('SELECT points_used FROM orders WHERE order_id = ?', orderId);
  assert.ok(pointsUsed > 0);
  const results = await Promise.all(Array.from({ length: 5 }, () => call(server, 'PATCH', `/api/orders/${number}/cancel`, {
    userId: customer, body: { reason: 'Uji bersamaan' },
  })));
  await sleep(200);
  const after = await trail(number);
  const [refund] = await rows("SELECT COUNT(*) AS n, SUM(points) AS p FROM point_transactions WHERE order_id = ? AND type = 'refund'", orderId);
  record(FILE, 'N4', { statuses: tally(results), after, refund });
  assert.deepEqual(tally(results), { 200: 1, 409: 4 });
  assert.deepEqual([Number(refund.n), Number(refund.p)], [1, pointsUsed]);
  assert.deepEqual(after.notices.map((n) => [n.type, n.title]), [
    ['order_status', 'Pesanan dibuat'], ['order_status', 'Pesanan dibatalkan'], ['points', `+${pointsUsed} poin`],
  ]);
  assert.equal(after.notices[1].body, `Pesanan ${number} dibatalkan. Alasan: Uji bersamaan`);
  assert.equal(after.histories, 2);
});

test('N5 urutan kunci: AD-04 (orders X) menunggu users pelanggan yang dipegang checkout; checkout lanjut & commit → 0 deadlock', async () => {
  const customer = await createUser('customer');
  const number = await placeOrder(customer);
  await prepareOrder(number, 'dikonfirmasi');
  const metricsBefore = await innodbMetrics();
  // Checkout pelanggan yang sama sedang berjalan: lockRows langkah 1 (users X)
  const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
  await checkoutTx.ready;
  const pending = changeStatus(server, staff, number, { from: 'dikonfirmasi', to: 'sedang_disiapkan' });
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
  const conn = waits.find((w) => w.waiting_table === 'users').waiting_conn;
  const held = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.lock_mode}`);
  // Checkout melanjutkan urutan kuncinya (store_settings X, lalu stok) — tidak membutuhkan baris orders yang dipegang AD-04
  const checkoutDone = await checkoutTx.release(async (tx) => {
    await tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE');
    await tx.$queryRawUnsafe('SELECT product_id FROM daily_stocks LIMIT 1 FOR UPDATE');
  }).then(() => 'commit', (e) => e.code ?? e.message);
  const res = await pending;
  await sleep(200);
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  const result = { held, waiting: waits.filter((w) => w.waiting_table === 'users').map((w) => w.waiting_mode), checkoutDone, status: res.status, deadlocks };
  if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'N5', result);
  assert.ok(held.some((h) => h.startsWith('orders:X')), `AD-04 memegang kunci X pesanan: ${held}`);
  assert.ok(result.waiting.every((m) => /^S/.test(m)), 'AD-04 menunggu kunci S (FK) baris pelanggan');
  assert.equal(checkoutDone, 'commit');
  assert.equal(res.status, 200);
  assert.equal(deadlocks, 0);
  assert.equal((await trail(number)).notices.at(-1).title, 'Pesanan sedang disiapkan');
});

test(`N6 beban campuran × ${ROUNDS}: checkout + AD-04 + simulasi lunas + batal pelanggan yang sama → tanpa 5xx, 0 deadlock, riwayat = notifikasi`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const mismatches = [];
  const numbers = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const customer = await createUser('customer');
    const toAdvance = await placeOrder(customer);
    await prepareOrder(toAdvance, 'dikonfirmasi');
    const toPay = await placeOrder(customer);
    const toCancel = await placeOrder(customer);
    const items = [{ cart_item_id: unique('ci'), product_id: '9', quantity: 1 }];
    const cart = await call(server, 'POST', '/api/cart', { userId: customer, body: { items } });
    const results = await Promise.all([
      call(server, 'POST', '/api/orders', { userId: customer, body: {
        items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date,
        time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: false, method_code: 'qris',
      } }),
      changeStatus(server, staff, toAdvance, { from: 'dikonfirmasi', to: 'sedang_disiapkan' }),
      call(server, 'POST', `/api/payments/${toPay}/simulate-paid`, { userId: customer }),
      call(server, 'PATCH', `/api/orders/${toCancel}/cancel`, { userId: customer, body: { reason: 'Beban campuran' } }),
      call(server, 'PATCH', `/api/orders/${toPay}/cancel`, { userId: customer, body: { reason: 'Beban campuran' } }),
    ]);
    ['checkout', 'ad04', 'paid', 'cancel', 'cancelPaid'].forEach((name, i) => {
      const key = `${name} ${results[i].status}`;
      statuses[key] = (statuses[key] ?? 0) + 1;
    });
    numbers.push(toAdvance, toPay, toCancel);
    if (results[0].status === 201) numbers.push(results[0].body.data.order_number);
  }
  await sleep(300);
  for (const number of numbers) {
    const t = await trail(number);
    if (t.histories !== t.statusNotices) mismatches.push({ number, histories: t.histories, statusNotices: t.statusNotices });
    if (t.notices.some((n) => String(n.user_id) !== String(t.order.user_id))) mismatches.push({ number, wrongOwner: true });
  }
  const summary = {
    statuses, mismatches, orders: numbers.length,
    deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks,
    leftover: await appHeldLocks(), waits: await appLockWaits(),
  };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'N6', summary);
  assert.ok(Object.keys(statuses).every((k) => / (200|201|409)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(mismatches, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
