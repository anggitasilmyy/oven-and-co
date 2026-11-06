// tests-mysql/12-cancel-checkout-lock-order.it.test.js
// Step 6.5 C1 · temuan F-C1-1 (ada sejak Step 6.3) · FR-20 · BR-08 · TF-12 — pembatalan pelanggan × checkout pelanggan
// yang SAMA, MySQL 8 sungguhan.
// Siklus lama: batal = orders X → UPDATE payments WHERE order_id (next-key lock indeks payments_order_id_fkey sampai
// supremum bila pesanan ini entri terakhir) → INSERT riwayat (FK users → S, menunggu); checkout = users X → INSERT payments
// pesanan baru (insert intention di gap yang sama, menunggu) → deadlock 1213. Perbaikan: INSERT poin/riwayat/notifikasi
// pembatalan (users S) SEBELUM UPDATE orders & payments.
// X1 deterministik × 5: transaksi harness meniru checkout (users X → INSERT orders → INSERT payments) selagi pembatalan
//    asli (HTTP) menunggu users → keduanya commit, 0 deadlock; pembatalan tidak memegang kunci payments saat menunggu.
// X2 HTTP asli × 20: checkout + batal pesanan terbaru pelanggan yang sama bersamaan → tanpa 5xx, 0 deadlock.
// Kedua skenario memeriksa konsistensi: stok ready, kuota & klaim voucher, poin (refund tepat sekali), status
// pembayaran, tepat 1 riwayat & 1 notifikasi Dibatalkan, notifikasi poin refund tepat 1.

const test = require('node:test');
const assert = require('node:assert/strict');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');
const {
  db, rows, holdTransaction, waitForAppLockWait, appHeldLocks, appLockWaits, innodbMetrics, latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique } = require('./helpers/fixtures');

const FILE = '12-cancel-checkout-lock-order';
const ROUNDS_X1 = Number(process.env.C4_ROUNDS_X1 || 5);
const ROUNDS_X2 = Number(process.env.C4_ROUNDS_X2 || 20);
const TODAY = getJakartaDateKey(new Date());
let server;
let readyProduct;
let voucherId;
let voucherCode;

test.before(async () => {
  // Produk ready khusus uji dengan stok hari ini (stok berkurang saat pesanan dibuat & kembali saat batal — TF-12)
  await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
    VALUES (3, ?, 'Produk uji F-C1-1', 10000, 'ready', 0, 1)`, unique('F-C1-1 ready '));
  readyProduct = (await rows("SELECT product_id AS id FROM products WHERE description = 'Produk uji F-C1-1' ORDER BY product_id DESC LIMIT 1"))[0].id;
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', readyProduct, TODAY);
  // Voucher potongan tetap untuk semua produk; diklaim per pelanggan uji (BR-10)
  voucherCode = `FC1${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  await db.$executeRawUnsafe(`INSERT INTO vouchers (code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to, is_active)
    VALUES (?, 'Voucher uji F-C1-1', 'amount', 5000, NULL, 100000, DATE_SUB(?, INTERVAL 1 DAY), DATE_ADD(?, INTERVAL 30 DAY), 1)`,
  voucherCode, TODAY, TODAY);
  voucherId = (await rows('SELECT voucher_id FROM vouchers WHERE code = ?', voucherCode))[0].voucher_id;
  server = await startServer(FILE);
});
test.after(async () => {
  await server?.stop();
  await db.$disconnect();
});

/** Pelanggan baru dengan 300 poin & klaim voucher uji */
async function customerWithBenefits() {
  const customer = await createUser('customer');
  await db.$executeRawUnsafe("INSERT INTO point_transactions (user_id, type, points, created_at) VALUES (?, 'earn', 300, NOW())", customer);
  await db.$executeRawUnsafe('INSERT INTO user_vouchers (user_id, voucher_id, claimed_at) VALUES (?, ?, NOW())', customer, voucherId);
  return customer;
}

/** Body checkout: produk ready (stok hari ini) + pre-order 9 → tanggal siap = besok, slot apa pun sah */
async function orderBody(customer, { voucher = false, points = false } = {}) {
  const items = [
    { cart_item_id: unique('ci'), product_id: String(readyProduct), quantity: 2 },
    { cart_item_id: unique('ci'), product_id: '9', quantity: 1 },
  ];
  const cart = await call(server, 'POST', '/api/cart', { userId: customer, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  return {
    items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]),
    voucher_code: voucher ? voucherCode : null, use_points: points, method_code: 'qris',
  };
}

const stockSold = async () => Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', readyProduct, TODAY))[0].n);
const quota = async () => Number((await rows('SELECT quota AS n FROM vouchers WHERE voucher_id = ?', voucherId))[0].n);
const balance = async (customer) => Number((await rows('SELECT COALESCE(SUM(points), 0) AS n FROM point_transactions WHERE user_id = ?', customer))[0].n);
const claimUsed = async (customer) => (await rows('SELECT used_at FROM user_vouchers WHERE user_id = ? AND voucher_id = ?', customer, voucherId))[0].used_at !== null;

/** Jejak satu pesanan setelah dibatalkan */
async function cancelledTrail(number) {
  const [o] = await rows(`SELECT o.order_id, o.order_status, o.payment_status, o.points_used, p.status AS payment_row
    FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number);
  const count = async (sql) => Number((await rows(sql, o.order_id))[0].n);
  return {
    status: o.order_status, payment: o.payment_status, paymentRow: o.payment_row, pointsUsed: Number(o.points_used),
    cancelHistories: await count("SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ? AND status = 'dibatalkan'"),
    cancelNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'order_status' AND title = 'Pesanan dibatalkan'"),
    refundNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'points'"),
    refunds: await count("SELECT COUNT(*) AS n FROM point_transactions WHERE order_id = ? AND type = 'refund'"),
  };
}

function assertCancelledOnce(trail, label) {
  assert.deepEqual(
    [trail.status, trail.payment, trail.paymentRow, trail.cancelHistories, trail.cancelNotices],
    ['dibatalkan', 'unpaid', 'failed', 1, 1], label,
  );
  assert.equal(trail.refunds, trail.pointsUsed > 0 ? 1 : 0, `${label}: refund poin tepat sekali`);
  assert.equal(trail.refundNotices, trail.pointsUsed > 0 ? 1 : 0, `${label}: notifikasi poin refund tepat sekali`);
}

test(`X1 deterministik × ${ROUNDS_X1}: checkout (users X → INSERT orders → INSERT payments) selagi batal menunggu users → 0 deadlock`, async () => {
  const results = [];
  for (let round = 0; round < ROUNDS_X1; round += 1) {
    const customer = await customerWithBenefits();
    const made = await call(server, 'POST', '/api/orders', { userId: customer, body: await orderBody(customer, { voucher: true, points: true }) });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const number = made.body.data.order_number; // pesanan terbaru → entri terakhir indeks payments_order_id_fkey
    const before = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    const metricsBefore = await innodbMetrics();

    // Checkout pelanggan yang sama sedang berjalan: lockRows langkah 1 (users X)
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    await checkoutTx.ready;
    const cancel = call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji F-C1-1' } });
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
    const conn = waits.find((w) => w.waiting_table === 'users').waiting_conn;
    const heldWhileWaiting = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.lock_mode}`);
    // Checkout melanjutkan: INSERT pesanan baru lalu pembayarannya (insert intention di indeks payments_order_id_fkey)
    const checkout = await checkoutTx.release(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      unique('X1-').slice(0, 20), customer);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe(`INSERT INTO payments (order_id, method_code, amount, status, expired_at)
        VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)`, id);
    }).then(() => 'commit', (e) => `ERR ${e.code ?? ''} ${String(e.meta?.message ?? e.message).slice(0, 120)}`);
    const res = await cancel;
    await sleep(150);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const trail = await cancelledTrail(number);
    const after = { sold: await stockSold(), quota: await quota(), balance: await balance(customer), claimUsed: await claimUsed(customer) };
    const result = { round, cancel: res.status, checkout, deadlocks, heldWhileWaiting, trail, before, after };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    results.push(result);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(checkout, 'commit');
    assert.equal(deadlocks, 0);
    assert.ok(!heldWhileWaiting.some((l) => l.startsWith('payments:')), `batal belum memegang kunci payments saat menunggu users: ${heldWhileWaiting}`);
    assertCancelledOnce(trail, `X1 putaran ${round}`);
    assert.equal(after.sold, before.sold - 2, 'stok ready kembali tepat 2');
    assert.equal(after.quota, before.quota + 1, 'kuota voucher +1');
    assert.equal(after.claimUsed, false, 'klaim voucher bisa dipakai lagi');
    assert.equal(after.balance, before.balance + trail.pointsUsed, 'poin yang ditukar kembali tepat sekali');
  }
  record(FILE, 'X1', { results });
});

test(`X2 HTTP asli × ${ROUNDS_X2}: checkout + batal pesanan terbaru pelanggan yang sama bersamaan → tanpa 5xx, 0 deadlock, data konsisten`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  for (let round = 0; round < ROUNDS_X2; round += 1) {
    const customer = await customerWithBenefits();
    const made = await call(server, 'POST', '/api/orders', { userId: customer, body: await orderBody(customer, { voucher: true, points: true }) });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const number = made.body.data.order_number;
    const body = await orderBody(customer);
    const soldBefore = await stockSold();
    const [checkout, cancel] = await Promise.all([
      sleep(round % 3).then(() => call(server, 'POST', '/api/orders', { userId: customer, body })),
      call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji F-C1-1 beban' } }),
    ]);
    for (const [name, r] of [['checkout', checkout], ['cancel', cancel]]) {
      statuses[`${name} ${r.status}`] = (statuses[`${name} ${r.status}`] ?? 0) + 1;
    }
    const trail = await cancelledTrail(number);
    try { assertCancelledOnce(trail, `X2 ${round}`); } catch (e) { violations.push({ round, trail, error: e.message }); }
    // Stok: −2 dari pembatalan, +2 bila checkout baru berhasil
    const expectedSold = soldBefore - 2 + (checkout.status === 201 ? 2 : 0);
    const sold = await stockSold();
    if (sold !== expectedSold) violations.push({ round, sold, expectedSold });
    if (await claimUsed(customer)) violations.push({ round, claimStillUsed: true });
    if ((await balance(customer)) !== 300) violations.push({ round, balance: await balance(customer) });
  }
  await sleep(200);
  const summary = {
    statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks,
    leftover: await appHeldLocks(), waits: await appLockWaits(),
  };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'X2', summary);
  assert.deepEqual(statuses, { 'checkout 201': ROUNDS_X2, 'cancel 200': ROUNDS_X2 });
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
