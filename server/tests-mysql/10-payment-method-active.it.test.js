// tests-mysql/10-payment-method-active.it.test.js
// T2 (ROADMAP 6.4.10 · FR-14 · FR-15 · BR-05 · C-14 · C-15 · AD-11): metode bayar diperiksa ulang di dalam transaksi, MySQL 8.
// T2-a checkout menunggu kunci store_settings; transaksi lain (meniru AD-11) menonaktifkan metode lalu commit → 409,
//      tanpa pesanan/pembayaran/riwayat/stok.
// T2-b ganti metode: transaksi lain memegang kunci X baris metode (meniru UPDATE AD-11 yang sedang berjalan) lalu
//      menonaktifkannya → kunci S (FOR SHARE) melihat nilai terbaru → 409, pembayaran tidak berubah.
// T2-c ganti ke Bayar di Toko dengan kondisi T2-b → 409; perubahan pesanan & riwayat yang sudah ditulis di-rollback.
// T2-d urutan kunci: ganti ke Bayar di Toko menunggu baris pelanggan (dipegang checkout pelanggan yang sama) TANPA memegang
//      kunci metode → PATCH metode AD-11 asli tidak tertahan; checkout lalu mengambil store_settings → 0 deadlock.
// T2-e PATCH metode AD-11 asli bersamaan dengan checkout & ganti metode asli × putaran → tanpa 5xx, tanpa deadlock,
//      tanpa data parsial. (Bukti "metode nonaktif tidak pernah dipakai" = skenario deterministik T2-a/T2-b/T2-c; urutan
//      commit pada beban acak tidak bisa diamati dari data, jadi tidak diklaim di sini.)

const test = require('node:test');
const assert = require('node:assert/strict');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');
const {
  db, rows, holdTransaction, waitForAppLockWait, appHeldLocks, appLockWaits, innodbMetrics, latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, unique, tally } = require('./helpers/fixtures');

const FILE = '10-payment-method-active';
const ROUNDS = Number(process.env.C4_ROUNDS_T2 || 10);
const TODAY = getJakartaDateKey(new Date());
const UNAVAILABLE = 'Metode pembayaran baru saja dinonaktifkan. Pilih metode lain lalu coba lagi.';
const VA = 'va_bca';
let server;
let readyProduct;
let laterProduct; // pre-order khusus uji; diubah menjadi 'ready' setelah pesanan dibuat agar Bayar di Toko sah (BR-05)
let owner;

const setMethod = (code, active) => db.$executeRawUnsafe('UPDATE payment_methods SET is_active = ? WHERE method_code = ?', active ? 1 : 0, code);
const methodActive = async (code) => Number((await rows('SELECT is_active AS a FROM payment_methods WHERE method_code = ?', code))[0].a) === 1;

test.before(async () => {
  for (const [type, lead] of [['ready', 0], ['preorder', 1]]) {
    await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
      VALUES (3, ?, 'Produk uji T2', 10000, ?, ?, 1)`, unique(`T2 ${type} `), type, lead);
  }
  const ids = (await rows("SELECT product_id AS id, availability_type AS t FROM products WHERE description = 'Produk uji T2' ORDER BY product_id")).slice(-2);
  readyProduct = ids.find((p) => p.t === 'ready').id;
  laterProduct = ids.find((p) => p.t === 'preorder').id;
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', readyProduct, TODAY);
  server = await startServer(FILE);
  owner = await createUser('owner');
  await onlyTheseOwnersActive([owner]);
});
test.after(async () => {
  for (const code of [VA, 'pay_at_store', 'qris']) await setMethod(code, true);
  await server?.stop();
  await db.$disconnect();
});

async function orderBody(userId, methodCode = 'qris') {
  const items = [{ cart_item_id: unique('ci'), product_id: String(readyProduct), quantity: 1 }, { cart_item_id: unique('ci'), product_id: String(laterProduct), quantity: 1 }];
  const cart = await call(server, 'POST', '/api/cart', { userId, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  return { items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: false, method_code: methodCode };
}
const placeOrder = async (customer, methodCode) => call(server, 'POST', '/api/orders', { userId: customer, body: await orderBody(customer, methodCode) });
const footprint = async (customer) => ({
  orders: Number((await rows('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', customer))[0].n),
  histories: Number((await rows('SELECT COUNT(*) AS n FROM order_status_histories WHERE changed_by = ?', customer))[0].n),
  qtySold: Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', readyProduct, TODAY))[0].n),
});
const orderState = async (number) => (await rows(`SELECT o.order_status AS status, o.payment_option AS opt, p.method_code AS method,
  (SELECT COUNT(*) FROM order_status_histories h WHERE h.order_id = o.order_id) AS histories
  FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number))[0];
/** Pesanan (dibuat lewat checkout asli) yang item-nya semua 'ready' → boleh diganti ke Bayar di Toko */
async function payAtStoreEligibleOrder(customer) {
  const made = await placeOrder(customer, 'qris');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  await db.$executeRawUnsafe("UPDATE products SET availability_type = 'ready', lead_time_days = 0 WHERE product_id = ?", laterProduct);
  return made.body.data.order_number;
}
const restoreLater = () => db.$executeRawUnsafe("UPDATE products SET availability_type = 'preorder', lead_time_days = 1 WHERE product_id = ?", laterProduct);

test('T2-a checkout menunggu kunci store_settings; metode dinonaktifkan & di-commit → 409 tanpa data parsial', async () => {
  const customer = await createUser('customer');
  const body = await orderBody(customer, VA);
  const before = await footprint(customer);
  const settingsTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'));
  await settingsTx.ready;
  const pending = call(server, 'POST', '/api/orders', { userId: customer, body });
  await waitForAppLockWait((w) => w.waiting_table === 'store_settings');
  await settingsTx.release((tx) => tx.$executeRawUnsafe('UPDATE payment_methods SET is_active = 0 WHERE method_code = ?', VA));
  const res = await pending;
  const after = await footprint(customer);
  record(FILE, 'T2-a', { status: res.status, message: res.body.message, before, after });
  assert.deepEqual([res.status, res.body.message], [409, UNAVAILABLE]);
  assert.deepEqual(after, before);
  assert.deepEqual(await appHeldLocks(), []);
  await setMethod(VA, true);
});

async function changeWhileMethodRowLocked(number, customer, target) {
  const methodTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT method_code FROM payment_methods WHERE method_code = ? FOR UPDATE', target));
  await methodTx.ready;
  const pending = call(server, 'PATCH', `/api/orders/${number}/payment`, { userId: customer, body: { method_code: target } });
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'payment_methods');
  await methodTx.release((tx) => tx.$executeRawUnsafe('UPDATE payment_methods SET is_active = 0 WHERE method_code = ?', target));
  return { res: await pending, waits };
}

test('T2-b ganti metode: kunci S baris metode menunggu UPDATE AD-11, melihat nilai terbaru (nonaktif) → 409, pembayaran tetap', async () => {
  const customer = await createUser('customer');
  const made = await placeOrder(customer, 'qris');
  const number = made.body.data.order_number;
  const before = await orderState(number);
  const { res, waits } = await changeWhileMethodRowLocked(number, customer, VA);
  const after = await orderState(number);
  record(FILE, 'T2-b', { status: res.status, waits: waits.map((w) => `${w.waiting_table}:${w.waiting_mode}`), before, after });
  assert.ok(waits.some((w) => w.waiting_table === 'payment_methods' && /^S/.test(w.waiting_mode)), 'kunci S (FOR SHARE) pada baris metode');
  assert.deepEqual([res.status, res.body.message], [409, UNAVAILABLE]);
  assert.deepEqual(after, before);
  await setMethod(VA, true);
});

test('T2-c ganti ke Bayar di Toko: metode dinonaktifkan selagi request berjalan → 409; perubahan pesanan & riwayat di-rollback', async () => {
  const customer = await createUser('customer');
  const number = await payAtStoreEligibleOrder(customer);
  try {
    const before = await orderState(number);
    const { res } = await changeWhileMethodRowLocked(number, customer, 'pay_at_store');
    const after = await orderState(number);
    record(FILE, 'T2-c', { status: res.status, before, after });
    assert.deepEqual([res.status, res.body.message], [409, UNAVAILABLE]);
    assert.deepEqual(after, before, 'status, opsi bayar, metode, dan jumlah riwayat tidak berubah');
  } finally {
    await setMethod('pay_at_store', true);
    await restoreLater();
  }
});

test('T2-d urutan kunci: ganti ke Bayar di Toko antre di baris pelanggan TANPA memegang kunci metode → PATCH AD-11 tidak tertahan, 0 deadlock', async () => {
  const customer = await createUser('customer');
  const number = await payAtStoreEligibleOrder(customer);
  const metricsBefore = await innodbMetrics();
  try {
    // Checkout pelanggan yang sama sedang berjalan: memegang baris pelanggan (lockRows langkah 1)
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    await checkoutTx.ready;
    const change = call(server, 'PATCH', `/api/orders/${number}/payment`, { userId: customer, body: { method_code: 'pay_at_store' } });
    const [wait] = (await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer)))
      .filter((w) => w.waiting_table === 'users');
    const changeLocks = (await appHeldLocks()).filter((l) => String(l.conn) === String(wait.waiting_conn));
    // AD-11 menonaktifkan Bayar di Toko (store_settings X → payment_methods X): harus selesai tanpa menunggu
    const patch = await call(server, 'PATCH', '/api/admin/payment-methods/pay_at_store/active', { userId: owner, body: { is_active: false } });
    // Checkout lanjut ke store_settings (pada urutan lama inilah yang menutup siklus), lalu commit
    const checkoutDone = await checkoutTx.release((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE')).then(() => 'commit', (e) => e.code ?? e.message);
    const res = await change;
    await sleep(200);
    const metricsAfter = await innodbMetrics();
    const result = {
      waitingOn: `${wait.waiting_table}:${wait.waiting_mode}`, changeHoldsMethodLock: changeLocks.some((l) => l.table_name === 'payment_methods'),
      patch: [patch.status, patch.ms], checkout: checkoutDone, change: [res.status, res.body.message],
      deadlocks: metricsAfter.lock_deadlocks - metricsBefore.lock_deadlocks, state: await orderState(number),
    };
    if (result.deadlocks) result.latestDeadlock = await latestDeadlockSection();
    record(FILE, 'T2-d', result);
    assert.equal(result.changeHoldsMethodLock, false, 'ganti metode belum memegang kunci baris metode saat menunggu baris pelanggan');
    assert.equal(patch.status, 200);
    assert.ok(patch.ms < 1500, `PATCH AD-11 tidak tertahan (ms=${patch.ms})`);
    assert.equal(checkoutDone, 'commit');
    assert.deepEqual([res.status, res.body.message], [409, UNAVAILABLE], 'metode sudah nonaktif saat dikunci → 409');
    assert.equal(result.deadlocks, 0);
    assert.deepEqual([result.state.status, result.state.opt, result.state.method], ['menunggu_pembayaran', 'online', 'qris']);
  } finally {
    await call(server, 'PATCH', '/api/admin/payment-methods/pay_at_store/active', { userId: owner, body: { is_active: true } });
    await restoreLater();
  }
});

test(`T2-e PATCH metode AD-11 asli + checkout + ganti metode × ${ROUNDS} → tanpa 5xx, tanpa deadlock, tanpa data parsial`, async () => {
  await setMethod(VA, true);
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const buyers = [await createUser('customer'), await createUser('customer'), await createUser('customer')];
    const switcher = await createUser('customer');
    const switchOrder = (await placeOrder(switcher, 'qris')).body.data.order_number;
    const bodies = await Promise.all(buyers.map((c) => orderBody(c, VA)));
    const targetActive = round % 2 === 1; // putaran genap menonaktifkan VA, ganjil mengaktifkan kembali
    if (targetActive) await setMethod(VA, false);
    const results = await Promise.all([
      // Jeda 0–60 ms bervariasi: sebagian checkout/ganti metode mendahului PATCH (sukses), sebagian kalah (409)
      sleep((round * 13) % 61).then(() => call(server, 'PATCH', `/api/admin/payment-methods/${VA}/active`, { userId: owner, body: { is_active: targetActive } })),
      ...buyers.map((c, i) => call(server, 'POST', '/api/orders', { userId: c, body: bodies[i] })),
      call(server, 'PATCH', `/api/orders/${switchOrder}/payment`, { userId: switcher, body: { method_code: VA } }),
    ]);
    const [patch, ...rest] = results;
    statuses[`patch ${patch.status}`] = (statuses[`patch ${patch.status}`] ?? 0) + 1;
    Object.entries(tally(rest.slice(0, 3))).forEach(([s, n]) => { statuses[`checkout ${s}`] = (statuses[`checkout ${s}`] ?? 0) + n; });
    const sw = rest[3];
    statuses[`change ${sw.status}`] = (statuses[`change ${sw.status}`] ?? 0) + 1;
    // Invariant yang dapat diamati: 409/400 tanpa data parsial, ganti metode sukses → metode = VA, status akhir VA = tujuan PATCH
    for (let i = 0; i < 3; i += 1) {
      const f = await footprint(buyers[i]);
      if (rest[i].status !== 201 && f.orders !== 0) violations.push({ round, buyer: i, f });
    }
    const st = await orderState(switchOrder);
    if (sw.status === 200 && st.method !== VA) violations.push({ round, switch: st });
    if (sw.status !== 200 && st.method !== 'qris') violations.push({ round, switchPartial: st });
    if ((await methodActive(VA)) !== targetActive) violations.push({ round, finalVa: !targetActive });
  }
  await setMethod(VA, true);
  const metricsAfter = await innodbMetrics();
  const summary = { statuses, violations, deadlocks: metricsAfter.lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks(), waits: await appLockWaits() };
  record(FILE, 'T2-e', summary);
  assert.ok(Object.keys(statuses).every((k) => / (200|201|400|409)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
