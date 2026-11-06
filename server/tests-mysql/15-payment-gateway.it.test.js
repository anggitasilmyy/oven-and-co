// tests-mysql/15-payment-gateway.it.test.js
// Step 6.5 C4 · FR-14 · NFR-05 · BR-06 — pelunasan lewat fungsi internal gateway (applyGatewayPayment) yang dipanggil rute
// simulasi, MySQL 8 sungguhan. Tidak ada endpoint publik baru; kontrak HTTP sama.
// G1 normal & EXPIRED. G2 × job BR-06 (dua urutan antre). G3 × batal pelanggan. G4 × ganti metode (online & Bayar di
// Toko). G5 10 simulasi bersamaan lewat 2 proses server. G6 × checkout pelanggan yang sama (deterministik) & beban
// checkout. G7 rollback (trigger). G8 server production → 403. G9 beban campuran × 15 (simulasi + BR-06/BR-07 + batal +
// ganti metode + checkout).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  ARTIFACT_DIR, APP_URL, db, rows, holdTransaction, waitForAppLockWait, waitForAppLockWaits, appHeldLocks, innodbMetrics,
  latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, tally } = require('./helpers/fixtures');
const { createAutoCancelFixtures } = require('./helpers/autoCancelFixtures');

process.env.DATABASE_URL = APP_URL;
const job = require('../src/jobs/autoCancelOrders');
const appPrisma = require('../src/lib/prisma');

const FILE = '15-payment-gateway';
const ROUNDS_G9 = Number(process.env.C4_ROUNDS_G9 || 15);
const NOT_PENDING = 'Pesanan tidak lagi menunggu pembayaran.';
const EXPIRED = 'Batas waktu pembayaran sudah lewat.';
const C4_JWT = 'c4-integration-secret-only-for-temporary-mysql'; // sama dengan helpers/server.js
let server;
let serverB;
const fx = createAutoCancelFixtures({ label: 'C4G', getServer: () => server });

test.before(async () => {
  await fx.setup();
  server = await startServer(FILE);
  serverB = await startServer(`${FILE}-b`);
});
test.after(async () => {
  try { fx.mysqlCli('DROP TRIGGER IF EXISTS c4_fail_notification;'); } catch { /* abaikan */ }
  await server?.stop();
  await serverB?.stop();
  await appPrisma.$disconnect();
  await db.$disconnect();
});

const simulate = (number, customer, srv = server) => call(srv, 'POST', `/api/payments/${number}/simulate-paid`, { userId: customer });
const payState = async (number) => (await rows(`SELECT o.order_status AS status, o.payment_status AS ps, p.status AS pay, p.method_code AS method,
  p.paid_at AS paidAt FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number))[0];
const histories = async (number) => rows(`SELECT status, changed_by FROM order_status_histories WHERE order_id =
  (SELECT order_id FROM orders WHERE order_number = ?) ORDER BY history_id`, number);
/** Satu pesanan menjadi semua item ready (BR-05) — penyiapan SQL agar boleh ganti ke Bayar di Toko */
const makeAllReady = async (number) => db.$executeRawUnsafe('UPDATE order_items SET product_id = ? WHERE order_id = ?', fx.state.readyProduct, await fx.orderIdOf(number));

/** Harness memegang orders X; first & second antre berurutan; lepas → hasil keduanya */
async function queueOnOrder(number, first, second) {
  const hold = fx.holdOrder(number);
  await hold.ready;
  const p1 = first();
  await waitForAppLockWaits(1);
  const p2 = second();
  await waitForAppLockWaits(2);
  await hold.release();
  return Promise.all([p1, p2]);
}

// ── G1 ───────────────────────────────────────────────────────────────────────────────────────────

test('G1 simulasi normal: lunas → Dikonfirmasi, 1 riwayat sistem, 1 notifikasi, email setelah commit; EXPIRED → 409 tanpa perubahan', async () => {
  const customer = await fx.customerWithBenefits();
  const number = await fx.placeOrder(customer);
  const res = await simulate(number, customer);
  assert.deepEqual([res.status, res.body.data], [200, { order_number: number }]);
  const st = await payState(number);
  assert.deepEqual([st.status, st.ps, st.pay], ['dikonfirmasi', 'paid', 'paid']);
  assert.ok(st.paidAt);
  assert.deepEqual((await histories(number)).map((h) => [h.status, h.changed_by]), [['menunggu_pembayaran', customer], ['dikonfirmasi', null]]);
  const t = await fx.trail(number);
  assert.equal(t.statusNotices, 2);
  await sleep(100);
  assert.equal(server.readLog().split('\n').filter((l) => l.startsWith('[DEV EMAIL]') && l.includes(`Pesanan ${number} sudah kami terima`)).length, 1);

  const late = await fx.placeOrder(customer);
  await fx.setExpiry(late, -60000);
  const before = await fx.trail(late);
  const lateRes = await simulate(late, customer);
  assert.deepEqual([lateRes.status, lateRes.body.message], [409, EXPIRED]);
  assert.deepEqual(await fx.trail(late), before);
  assert.equal((await payState(late)).pay, 'pending');
});

// ── G2 / G3 / G4 ─────────────────────────────────────────────────────────────────────────────────

for (const first of ['simulasi', 'job']) {
  test(`G2 simulasi × job BR-06, ${first} antre lebih dulu → lunas XOR batal`, async () => {
    await job.runAutoCancel({ now: new Date() }); // bersihkan pesanan lama yang sudah lewat batas (mis. G1) — stok bersama
    const customer = await fx.customerWithBenefits();
    const number = await fx.placeOrder(customer, { benefits: true });
    const expiredAt = await fx.setExpiry(number, 3000); // simulasi (now = saat request) masih sah; job memakai now setelah batas
    const before = await fx.benefits(customer);
    const metricsBefore = await innodbMetrics();
    const pay = () => simulate(number, customer);
    const run = () => job.runAutoCancel({ now: new Date(expiredAt.getTime() + 1000) });
    const [x, y] = await queueOnOrder(number, first === 'job' ? run : pay, first === 'job' ? pay : run);
    const [summary, payRes] = first === 'job' ? [x, y] : [y, x];
    const t = await fx.trail(number);
    record(FILE, `G2-${first}`, { pay: [payRes.status, payRes.body.message], cancelled: summary.cancelled.includes(number), t });
    assert.notEqual(summary.cancelled.includes(number), payRes.status === 200, 'tepat satu hasil');
    if (first === 'job') {
      assert.deepEqual([payRes.status, payRes.body.message], [409, NOT_PENDING]);
      fx.assertAutoCancelledOnce(t, 'Tidak dibayar dalam 30 menit (BR-06)', 'G2');
    } else {
      assert.equal(payRes.status, 200);
      assert.ok(summary.skipped.includes(number));
      assert.deepEqual([t.status, t.payment, t.paymentRow, t.cancelHistories, t.refunds], ['dikonfirmasi', 'paid', 'paid', 0, 0]);
      assert.deepEqual(await fx.benefits(customer), before);
    }
    assert.equal((await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, 0);
  });

  test(`G3 simulasi × batal pelanggan, ${first === 'job' ? 'batal' : 'simulasi'} antre lebih dulu`, async () => {
    const customer = await fx.customerWithBenefits();
    const number = await fx.placeOrder(customer, { benefits: true });
    const pay = () => simulate(number, customer);
    const cancel = () => call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji G3' } });
    const [x, y] = await queueOnOrder(number, first === 'job' ? cancel : pay, first === 'job' ? pay : cancel);
    const [cancelRes, payRes] = first === 'job' ? [x, y] : [y, x];
    const st = await payState(number);
    const t = await fx.trail(number);
    record(FILE, `G3-${first}`, { pay: payRes.status, cancel: cancelRes.status, st });
    assert.equal(cancelRes.status, 200);
    assert.equal(t.cancelHistories, 1);
    assert.equal(t.refunds, 1, 'poin dikembalikan tepat sekali');
    if (first === 'job') {
      assert.deepEqual([payRes.status, payRes.body.message], [409, NOT_PENDING]);
      assert.deepEqual([st.status, st.ps, st.pay], ['dibatalkan', 'unpaid', 'failed']);
    } else {
      assert.equal(payRes.status, 200, 'lunas lalu dibatalkan sebelum disiapkan (BR-08) → refunded');
      assert.deepEqual([st.status, st.ps, st.pay], ['dibatalkan', 'refunded', 'refunded']);
      assert.deepEqual((await histories(number)).map((h) => h.status), ['menunggu_pembayaran', 'dikonfirmasi', 'dibatalkan']);
    }
    assert.equal(t.histories, t.statusNotices);
  });

  test(`G4 simulasi × ganti metode (VA & Bayar di Toko), ${first === 'job' ? 'ganti metode' : 'simulasi'} antre lebih dulu`, async () => {
    for (const target of ['va_bca', 'pay_at_store']) {
      const customer = await fx.customerWithBenefits();
      const number = await fx.placeOrder(customer);
      if (target === 'pay_at_store') await makeAllReady(number);
      const pay = () => simulate(number, customer);
      const change = () => call(server, 'PATCH', `/api/orders/${number}/payment`, { userId: customer, body: { method_code: target } });
      const [x, y] = await queueOnOrder(number, first === 'job' ? change : pay, first === 'job' ? pay : change);
      const [changeRes, payRes] = first === 'job' ? [x, y] : [y, x];
      const st = await payState(number);
      record(FILE, `G4-${first}-${target}`, { pay: payRes.status, change: changeRes.status, st });
      if (first === 'job') {
        assert.equal(changeRes.status, 200, JSON.stringify(changeRes.body));
        if (target === 'va_bca') {
          assert.equal(payRes.status, 200, 'gateway_ref tetap SIM-<nomor> setelah ganti metode online');
          assert.deepEqual([st.status, st.pay, st.method], ['dikonfirmasi', 'paid', 'va_bca']);
        } else {
          assert.deepEqual([payRes.status, payRes.body.message], [409, NOT_PENDING]);
          assert.deepEqual([st.status, st.ps, st.pay, st.method], ['dikonfirmasi', 'unpaid', 'pending', 'pay_at_store']);
        }
      } else {
        assert.equal(payRes.status, 200);
        assert.deepEqual([changeRes.status, changeRes.body.message], [409, NOT_PENDING]);
        assert.deepEqual([st.status, st.pay, st.method], ['dikonfirmasi', 'paid', 'qris']);
      }
      assert.equal((await histories(number)).filter((h) => h.status === 'dikonfirmasi').length, 1, 'satu riwayat Dikonfirmasi');
    }
  });
}

// ── G5 ───────────────────────────────────────────────────────────────────────────────────────────

test('G5 10 simulasi bersamaan lewat 2 proses server → tepat 1 sukses, tanpa riwayat/notifikasi/paid_at ganda', async () => {
  const customer = await fx.customerWithBenefits();
  const number = await fx.placeOrder(customer);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => simulate(number, customer, i % 2 ? serverB : server)));
  await sleep(100);
  const t = await fx.trail(number);
  record(FILE, 'G5', { statuses: tally(results), t });
  assert.deepEqual(tally(results), { 200: 1, 409: 9 });
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.message === NOT_PENDING));
  assert.deepEqual([t.histories, t.statusNotices], [2, 2]);
  assert.equal((await histories(number)).filter((h) => h.status === 'dikonfirmasi').length, 1);
});

// ── G6 ───────────────────────────────────────────────────────────────────────────────────────────

test('G6a simulasi × checkout pelanggan yang SAMA (deterministik): simulasi menunggu users tanpa kunci indeks payments → 0 deadlock', async () => {
  for (let round = 0; round < 3; round += 1) {
    const customer = await fx.customerWithBenefits();
    const number = await fx.placeOrder(customer); // pesanan terbaru → entri terakhir indeks payments_order_id_fkey
    const metricsBefore = await innodbMetrics();
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    await checkoutTx.ready;
    const pay = simulate(number, customer);
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
    const conn = waits.find((w) => w.waiting_table === 'users').waiting_conn;
    const held = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.index_name ?? ''}:${l.lock_mode}`);
    const checkout = await checkoutTx.release(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      `G6-${Date.now().toString(36)}${round}`.slice(0, 20), customer);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe("INSERT INTO payments (order_id, method_code, amount, status, expired_at) VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)", id);
    }).then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-120)}`);
    const res = await pay;
    await sleep(100);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = { round, held, checkout, pay: res.status, deadlocks };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    record(FILE, 'G6a', result);
    assert.ok(held.some((l) => l.startsWith('orders:') && l.includes(':X')), held.join(' '));
    assert.ok(!held.some((l) => l.startsWith('payments:payments_order_id_fkey')), `tanpa kunci indeks payments_order_id_fkey: ${held.join(' | ')}`);
    assert.equal(checkout, 'commit');
    assert.equal(res.status, 200);
    assert.equal(deadlocks, 0);
  }
});

test('G6b beban: simulasi + checkout pelanggan yang sama + checkout pelanggan lain × 10 → tanpa 5xx, 0 deadlock', async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  for (let round = 0; round < 10; round += 1) {
    const customer = await fx.customerWithBenefits();
    const other = await createUser('customer');
    const number = await fx.placeOrder(customer);
    const [b1, b2] = [await fx.orderBody(customer), await fx.orderBody(other)];
    const results = await Promise.all([
      simulate(number, customer),
      call(server, 'POST', '/api/orders', { userId: customer, body: b1 }),
      call(serverB, 'POST', '/api/orders', { userId: other, body: b2 }),
    ]);
    ['pay', 'checkout', 'checkoutOther'].forEach((k, i) => { statuses[`${k} ${results[i].status}`] = (statuses[`${k} ${results[i].status}`] ?? 0) + 1; });
  }
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  record(FILE, 'G6b', { statuses, deadlocks });
  assert.deepEqual(statuses, { 'pay 200': 10, 'checkout 201': 10, 'checkoutOther 201': 10 });
  assert.equal(deadlocks, 0);
});

// ── G7 / G8 ──────────────────────────────────────────────────────────────────────────────────────

test('G7 rollback: trigger menolak notifikasi Dikonfirmasi → 500, payment tetap pending, tanpa riwayat; lalu pulih', async () => {
  const customer = await fx.customerWithBenefits();
  const number = await fx.placeOrder(customer);
  const orderId = await fx.orderIdOf(number);
  const before = { t: await fx.trail(number), st: await payState(number) };
  fx.mysqlCli(`DELIMITER //
    CREATE TRIGGER c4_fail_notification BEFORE INSERT ON notifications FOR EACH ROW
    BEGIN IF NEW.order_id = ${Number(orderId)} AND NEW.title = 'Pesanan dikonfirmasi' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'uji rollback C4'; END IF; END//
    DELIMITER ;`);
  let res;
  try {
    res = await simulate(number, customer);
  } finally {
    fx.mysqlCli('DROP TRIGGER IF EXISTS c4_fail_notification;');
  }
  record(FILE, 'G7', { status: res.status });
  assert.equal(res.status, 500);
  assert.deepEqual(await fx.trail(number), before.t);
  assert.deepEqual(await payState(number), before.st);
  assert.equal((await simulate(number, customer)).status, 200);
});

test('G8 server NODE_ENV=production → simulasi 403 tanpa perubahan data', async () => {
  const customer = await fx.customerWithBenefits();
  const number = await fx.placeOrder(customer);
  const before = { t: await fx.trail(number), st: await payState(number) };
  const logPath = path.join(ARTIFACT_DIR, `server-${FILE}-production.log`);
  const log = fs.openSync(logPath, 'w');
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: APP_URL, PORT: String(port), JWT_SECRET: C4_JWT, NODE_ENV: 'production', AUTO_CANCEL_ENABLED: 'false' },
    stdio: ['ignore', log, log],
  });
  const prod = { baseUrl: `http://127.0.0.1:${port}` };
  try {
    for (let i = 0; ; i += 1) {
      try { if ((await fetch(`${prod.baseUrl}/api/health`)).ok) break; } catch { /* belum siap */ }
      if (i > 200 || child.exitCode !== null) throw new Error(`server production gagal start: ${fs.readFileSync(logPath, 'utf8')}`);
      await sleep(50);
    }
    const res = await simulate(number, customer, prod);
    record(FILE, 'G8', { status: res.status, message: res.body.message });
    assert.deepEqual([res.status, res.body.message], [403, 'Simulasi hanya tersedia di mode development']);
    assert.deepEqual(await fx.trail(number), before.t);
    assert.deepEqual(await payState(number), before.st);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    fs.closeSync(log);
  }
});

// ── G9 ───────────────────────────────────────────────────────────────────────────────────────────

test(`G9 beban × ${ROUNDS_G9}: simulasi + job (BR-06/BR-07) + batal + ganti metode + checkout → tanpa 5xx, 0 deadlock, konsisten`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  const bump = (k) => { statuses[k] = (statuses[k] ?? 0) + 1; };
  for (let round = 0; round < ROUNDS_G9; round += 1) {
    const customer = await fx.customerWithBenefits();
    const vsJob = await fx.placeOrder(customer, { benefits: true });
    const vsCancel = await fx.placeOrder(customer);
    const vsChange = await fx.placeOrder(customer);
    const expiry = await fx.setExpiry(vsJob, 1500);
    const body = await fx.orderBody(customer);
    const now = new Date(expiry.getTime() + 1000);
    const [p1, p2, p3, jobA, jobB, cancel, change, checkout] = await Promise.all([
      simulate(vsJob, customer),
      simulate(vsCancel, customer, serverB),
      simulate(vsChange, customer),
      job.runAutoCancel({ now }),
      sleep(round % 3).then(() => job.runAutoCancel({ now })),
      call(serverB, 'PATCH', `/api/orders/${vsCancel}/cancel`, { userId: customer, body: { reason: 'Uji G9' } }),
      call(server, 'PATCH', `/api/orders/${vsChange}/payment`, { userId: customer, body: { method_code: 'va_bca' } }),
      call(serverB, 'POST', '/api/orders', { userId: customer, body }),
    ]);
    for (const [k, r] of [['payJob', p1], ['payCancel', p2], ['payChange', p3], ['cancel', cancel], ['change', change], ['checkout', checkout]]) bump(`${k} ${r.status}`);
    const failed = [...jobA.failed, ...jobB.failed];
    if (failed.length) violations.push({ round, failed });
    const jobT = await fx.trail(vsJob);
    if ((p1.status === 200) === (jobT.status === 'dibatalkan' && jobT.paymentRow === 'expired')) violations.push({ round, xor: [p1.status, jobT.status, jobT.paymentRow] });
    for (const n of [vsJob, vsCancel, vsChange]) {
      const t = await fx.trail(n);
      const confirmed = (await histories(n)).filter((h) => h.status === 'dikonfirmasi').length;
      if (confirmed > 1 || t.cancelHistories > 1 || t.histories !== t.statusNotices || t.refunds > 1) violations.push({ round, n, t, confirmed });
      const st = await payState(n);
      if (st.pay === 'paid' && st.ps !== 'paid') violations.push({ round, n, st });
    }
  }
  await sleep(200);
  const summary = { statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks() };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'G9', summary);
  assert.ok(Object.keys(statuses).every((k) => / (200|201|409)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});
