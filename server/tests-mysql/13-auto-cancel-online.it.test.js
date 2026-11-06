// tests-mysql/13-auto-cancel-online.it.test.js
// Step 6.5 C2 · FR-38 · BR-06 · NFR-05 — pembatalan otomatis pembayaran online pada MySQL 8 sungguhan.
// Job dijalankan di proses uji (akun aplikasi c4app, src/lib/prisma) dan di proses anak terpisah (dua proses job).
// Kondisi awal (batas bayar) disiapkan lewat SQL; AKSI yang diuji (job, simulasi lunas, batal, checkout) asli.
// M1 job normal: hanya pesanan online yang lewat batas dibatalkan; efek lengkap; tepat 1 riwayat & notifikasi.
// M2 job × simulate-paid, deterministik DUA urutan antre kunci → tepat satu hasil bisnis (lunas XOR batal).
// M3 job × pembatalan pelanggan, dua urutan → satu pembatalan; stok/voucher/poin kembali tepat sekali.
// M4 dua PROSES job pada pesanan yang sama (antre kunci yang sama + 10 pesanan bersamaan) → tanpa efek ganda.
// M5 job × checkout pelanggan yang sama (F-C1-1): job menunggu users TANPA memegang kunci payments → 0 deadlock.
// M6 rollback: trigger MySQL menolak notifikasi satu pesanan → pesanan itu utuh, pesanan lain dibatalkan, lalu pulih.
// M7 beban × 15: job (2 pelari) + simulasi lunas + batal + checkout bersamaan → tanpa 5xx, 0 deadlock, data konsisten.
// M8 penjadwal asli (node-cron, NODE_ENV=development): putaran saat start membatalkan pesanan; SIGTERM keluar bersih.
// M9 graceful shutdown: SIGTERM tiba saat job memegang kunci pesanan dan transaksinya masih berjalan → proses & koneksi
//    tetap hidup sampai transaksi commit (M9a) / rollback 1205 (M9b); kandidat berikutnya tidak diproses; baru setelah
//    itu disconnect & exit 0; tanpa data parsial.
// M10 query kandidat di luar transaksi dibatasi MAX_EXECUTION_TIME: metadata lock nyata (LOCK TABLES orders WRITE dari
//    sesi mysql lain) menahan query → (a) query berhenti ±5 s dengan ER 3024, dicatat, tanpa transaksi; (b) SIGTERM saat
//    query tertahan → proses menunggu query berhenti, lalu disconnect & exit 0 SEBELUM pemegang lock melepas; (c) SIGTERM
//    lalu lock dilepas sebelum batas → query selesai, kandidat TIDAK diproses (shutdown), exit 0.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');
const {
  ARTIFACT_DIR, APP_URL, CONTAINER, DATABASE, db, rows, holdTransaction, waitForAppLockWaits, waitForAppLockWait, appHeldLocks, appLockWaits,
  appOpenTransactions, innodbMetrics, latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call } = require('./helpers/server');
const { createUser, unique } = require('./helpers/fixtures');

// Job di proses uji memakai akun aplikasi (c4app) — sama dengan server aplikasi
process.env.DATABASE_URL = APP_URL;
const job = require('../src/jobs/autoCancelOrders');
const appPrisma = require('../src/lib/prisma');

const FILE = '13-auto-cancel-online';
const SERVER_DIR = path.join(__dirname, '..');
const ROUNDS_M7 = Number(process.env.C4_ROUNDS_M7 || 15);
const REASON = 'Tidak dibayar dalam 30 menit (BR-06)';
const TODAY = getJakartaDateKey(new Date());
let server;
let readyProduct;
let voucherId;
let voucherCode;

test.before(async () => {
  await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
    VALUES (3, ?, 'Produk uji C2', 10000, 'ready', 0, 1)`, unique('C2 ready '));
  readyProduct = (await rows("SELECT product_id AS id FROM products WHERE description = 'Produk uji C2' ORDER BY product_id DESC LIMIT 1"))[0].id;
  await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', readyProduct, TODAY);
  voucherCode = `C2${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  await db.$executeRawUnsafe(`INSERT INTO vouchers (code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to, is_active)
    VALUES (?, 'Voucher uji C2', 'amount', 5000, NULL, 100000, DATE_SUB(?, INTERVAL 1 DAY), DATE_ADD(?, INTERVAL 30 DAY), 1)`, voucherCode, TODAY, TODAY);
  voucherId = (await rows('SELECT voucher_id FROM vouchers WHERE code = ?', voucherCode))[0].voucher_id;
  server = await startServer(FILE);
});
test.after(async () => {
  try { dropTrigger(); } catch { /* container mungkin sudah berhenti */ }
  await server?.stop();
  await appPrisma.$disconnect();
  await db.$disconnect();
});

// ── Data uji ─────────────────────────────────────────────────────────────────────────────────────

/** Pelanggan baru dengan 300 poin & klaim voucher uji */
async function customerWithBenefits() {
  const customer = await createUser('customer');
  await db.$executeRawUnsafe("INSERT INTO point_transactions (user_id, type, points, created_at) VALUES (?, 'earn', 300, NOW())", customer);
  await db.$executeRawUnsafe('INSERT INTO user_vouchers (user_id, voucher_id, claimed_at) VALUES (?, ?, NOW())', customer, voucherId);
  return customer;
}

async function orderBody(customer, { benefits = false } = {}) {
  const items = [
    { cart_item_id: unique('ci'), product_id: String(readyProduct), quantity: 2 },
    { cart_item_id: unique('ci'), product_id: '9', quantity: 1 },
  ];
  const cart = await call(server, 'POST', '/api/cart', { userId: customer, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  return {
    items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]),
    voucher_code: benefits ? voucherCode : null, use_points: benefits, method_code: 'qris',
  };
}

async function placeOrder(customer, opts) {
  const res = await call(server, 'POST', '/api/orders', { userId: customer, body: await orderBody(customer, opts) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.order_number;
}

/** Penyiapan: geser batas bayar pesanan (SQL langsung, bukan kode yang diuji). Mengembalikan expired_at (detik penuh). */
async function setExpiry(number, offsetMs) {
  const expiredAt = new Date(Math.floor((Date.now() + offsetMs) / 1000) * 1000);
  const [{ order_id: orderId }] = await rows('SELECT order_id FROM orders WHERE order_number = ?', number);
  await db.payment.updateMany({ where: { orderId: BigInt(orderId) }, data: { expiredAt } });
  return expiredAt;
}
const justAfter = (date) => new Date(date.getTime() + 1000);

/** DDL trigger lewat klien mysql di container (CREATE/DROP TRIGGER tidak didukung protokol prepared statement — 1295) */
function mysqlCli(sql) {
  const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
  const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mysql gagal: ${result.stderr}`);
}
const dropTrigger = () => mysqlCli('DROP TRIGGER IF EXISTS c2_fail_notification;');

const stockSold = async () => Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', readyProduct, TODAY))[0].n);
const quota = async () => Number((await rows('SELECT quota AS n FROM vouchers WHERE voucher_id = ?', voucherId))[0].n);
const balance = async (customer) => Number((await rows('SELECT COALESCE(SUM(points), 0) AS n FROM point_transactions WHERE user_id = ?', customer))[0].n);
const claimUsed = async (customer) => (await rows('SELECT used_at FROM user_vouchers WHERE user_id = ? AND voucher_id = ?', customer, voucherId))[0].used_at !== null;

/** Jejak satu pesanan: status, pembayaran, jumlah riwayat/notifikasi/refund */
async function trail(number) {
  const [o] = await rows(`SELECT o.order_id, o.user_id, o.order_status, o.payment_status, o.cancel_reason, o.points_used, p.status AS payment_row
    FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.order_number = ?`, number);
  const count = async (sql) => Number((await rows(sql, o.order_id))[0].n);
  return {
    status: o.order_status, payment: o.payment_status, paymentRow: o.payment_row, reason: o.cancel_reason, pointsUsed: Number(o.points_used),
    histories: await count('SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ?'),
    cancelHistories: await count("SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ? AND status = 'dibatalkan'"),
    systemCancel: await count("SELECT COUNT(*) AS n FROM order_status_histories WHERE order_id = ? AND status = 'dibatalkan' AND changed_by IS NULL"),
    statusNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'order_status'"),
    cancelNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND title = 'Pesanan dibatalkan'"),
    pointNotices: await count("SELECT COUNT(*) AS n FROM notifications WHERE order_id = ? AND type = 'points'"),
    refunds: await count("SELECT COUNT(*) AS n FROM point_transactions WHERE order_id = ? AND type = 'refund'"),
  };
}

/** Pesanan dibatalkan JOB tepat sekali (BR-06) */
function assertAutoCancelledOnce(t, label) {
  assert.deepEqual([t.status, t.payment, t.paymentRow, t.reason], ['dibatalkan', 'unpaid', 'expired', REASON], label);
  assert.deepEqual([t.cancelHistories, t.systemCancel, t.cancelNotices], [1, 1, 1], `${label}: 1 riwayat sistem & 1 notifikasi`);
  assert.equal(t.histories, t.statusNotices, `${label}: riwayat = notifikasi status`);
  assert.equal(t.refunds, t.pointsUsed > 0 ? 1 : 0, `${label}: refund poin tepat sekali`);
  assert.equal(t.pointNotices, t.pointsUsed > 0 ? 1 : 0, `${label}: notifikasi poin tepat sekali`);
}

/** Pegang kunci X baris pesanan (meniru transaksi lain yang sedang memproses pesanan itu) */
const holdOrder = (number) => holdTransaction((tx) => tx.$queryRawUnsafe('SELECT order_id FROM orders WHERE order_number = ? FOR UPDATE', number));

/** Job di proses anak terpisah (proses job kedua) → ringkasan runAutoCancel */
function runJobProcess(now) {
  const code = `const job = require('./src/jobs/autoCancelOrders');
    job.runAutoCancel({ now: new Date(${JSON.stringify(now.toISOString())}) })
      .then((s) => { process.stdout.write('RESULT ' + JSON.stringify(s) + '\\n'); return require('./src/lib/prisma').$disconnect(); })
      .then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code], { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: APP_URL, NODE_ENV: 'test' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (exitCode) => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT '));
      if (exitCode !== 0 || !line) return reject(new Error(`proses job gagal (${exitCode}): ${err.slice(0, 500)}`));
      return resolve(JSON.parse(line.slice(7)));
    });
  });
}

// ── M1 ───────────────────────────────────────────────────────────────────────────────────────────

test('M1 job normal: hanya pesanan online lewat batas yang dibatalkan; stok/voucher/poin kembali; 1 riwayat sistem & notifikasi', async () => {
  const customer = await customerWithBenefits();
  const overdue = await placeOrder(customer, { benefits: true });
  const notYet = await placeOrder(customer);
  const paid = await placeOrder(customer);
  assert.equal((await call(server, 'POST', `/api/payments/${paid}/simulate-paid`, { userId: customer })).status, 200);
  const expiredAt = await setExpiry(overdue, -60000);
  await setExpiry(notYet, 5 * 60000);
  await setExpiry(paid, -60000);
  const before = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
  const pointsUsed = (await trail(overdue)).pointsUsed;
  assert.ok(pointsUsed > 0);

  // Tepat pada expired_at: belum dibatalkan (batas ketat, sama dengan penolakan pembayaran)
  const atBoundary = await job.runAutoCancel({ now: expiredAt });
  assert.ok(!atBoundary.cancelled.includes(overdue));
  assert.equal((await trail(overdue)).status, 'menunggu_pembayaran');

  const summary = await job.runAutoCancel({ now: new Date() });
  const t = await trail(overdue);
  const after = { sold: await stockSold(), quota: await quota(), balance: await balance(customer), claimUsed: await claimUsed(customer) };
  record(FILE, 'M1', { summary, t, before, after });
  assert.ok(summary.cancelled.includes(overdue));
  assert.ok(!summary.cancelled.includes(notYet) && !summary.cancelled.includes(paid));
  assertAutoCancelledOnce(t, 'M1');
  assert.equal((await trail(notYet)).status, 'menunggu_pembayaran');
  assert.deepEqual([(await trail(paid)).status, (await trail(paid)).paymentRow], ['dikonfirmasi', 'paid']);
  assert.equal(after.sold, before.sold - 2, 'stok ready kembali');
  assert.equal(after.quota, before.quota + 1, 'kuota voucher +1');
  assert.equal(after.claimUsed, false);
  assert.equal(after.balance, before.balance + pointsUsed, 'poin kembali');
  const [notice] = await rows("SELECT body FROM notifications WHERE order_id = (SELECT order_id FROM orders WHERE order_number = ?) AND title = 'Pesanan dibatalkan'", overdue);
  assert.equal(notice.body, `Pesanan ${overdue} dibatalkan. Alasan: ${REASON}`);

  // Idempoten: putaran berikutnya tidak menyentuh pesanan itu lagi
  const again = await job.runAutoCancel({ now: new Date() });
  assert.ok(!again.cancelled.includes(overdue) && !again.skipped.includes(overdue));
  assert.deepEqual(await trail(overdue), t);
  assert.equal(await stockSold(), after.sold);
});

// ── M2 ───────────────────────────────────────────────────────────────────────────────────────────

for (const first of ['job', 'pembayaran']) {
  test(`M2 job × simulate-paid, ${first} antre kunci lebih dulu → tepat satu hasil bisnis`, async () => {
    const customer = await customerWithBenefits();
    const number = await placeOrder(customer, { benefits: true });
    // Batas 3 s lagi: simulasi (server, `now` saat request) masih sah; job memakai `now` setelah batas
    const expiredAt = await setExpiry(number, 3000);
    const before = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    const metricsBefore = await innodbMetrics();
    const hold = holdOrder(number);
    await hold.ready;
    let jobRun;
    let pay;
    if (first === 'job') {
      jobRun = job.runAutoCancel({ now: justAfter(expiredAt) });
      await waitForAppLockWaits(1);
      pay = call(server, 'POST', `/api/payments/${number}/simulate-paid`, { userId: customer });
      await waitForAppLockWaits(2);
    } else {
      pay = call(server, 'POST', `/api/payments/${number}/simulate-paid`, { userId: customer });
      await waitForAppLockWaits(1);
      jobRun = job.runAutoCancel({ now: justAfter(expiredAt) });
      await waitForAppLockWaits(2);
    }
    await hold.release();
    const [summary, payRes] = await Promise.all([jobRun, pay]);
    await sleep(150);
    const t = await trail(number);
    const after = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    record(FILE, `M2-${first}`, { summary, pay: [payRes.status, payRes.body.message], t, before, after, deadlocks });

    const jobCancelled = summary.cancelled.includes(number);
    assert.notEqual(jobCancelled, payRes.status === 200, 'tepat satu yang berhasil (lunas XOR batal)');
    if (first === 'job') assert.ok(jobCancelled, 'antre pertama (job) menang');
    else assert.equal(payRes.status, 200, 'antre pertama (pembayaran) menang');
    if (jobCancelled) {
      assertAutoCancelledOnce(t, 'M2');
      assert.deepEqual([payRes.status, payRes.body.message], [409, 'Pesanan tidak lagi menunggu pembayaran.']);
      assert.deepEqual(after, { sold: before.sold - 2, quota: before.quota + 1, balance: before.balance + t.pointsUsed });
    } else {
      assert.ok(summary.skipped.includes(number), 'job melewati pesanan yang sudah lunas');
      assert.deepEqual([t.status, t.payment, t.paymentRow, t.cancelHistories, t.refunds], ['dikonfirmasi', 'paid', 'paid', 0, 0]);
      assert.deepEqual(after, before, 'stok/voucher/poin tidak dikembalikan');
    }
    assert.equal(deadlocks, 0);
  });
}

// ── M3 ───────────────────────────────────────────────────────────────────────────────────────────

for (const first of ['job', 'pelanggan']) {
  test(`M3 job × pembatalan pelanggan, ${first} antre lebih dulu → satu pembatalan; refund tepat sekali`, async () => {
    const customer = await customerWithBenefits();
    const number = await placeOrder(customer, { benefits: true });
    const expiredAt = await setExpiry(number, -60000);
    const before = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    const hold = holdOrder(number);
    await hold.ready;
    let jobRun;
    let cancel;
    const startCancel = () => call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji M3' } });
    if (first === 'job') {
      jobRun = job.runAutoCancel({ now: justAfter(expiredAt) });
      await waitForAppLockWaits(1);
      cancel = startCancel();
    } else {
      cancel = startCancel();
      await waitForAppLockWaits(1);
      jobRun = job.runAutoCancel({ now: justAfter(expiredAt) });
    }
    await waitForAppLockWaits(2);
    await hold.release();
    const [summary, cancelRes] = await Promise.all([jobRun, cancel]);
    await sleep(150);
    const t = await trail(number);
    const after = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    record(FILE, `M3-${first}`, { summary, cancel: [cancelRes.status, cancelRes.body.message], t, before, after });

    const jobCancelled = summary.cancelled.includes(number);
    assert.notEqual(jobCancelled, cancelRes.status === 200, 'tepat satu pembatalan');
    assert.equal(jobCancelled, first === 'job');
    assert.equal(t.cancelHistories, 1);
    assert.equal(t.cancelNotices, 1);
    assert.equal(t.refunds, 1);
    assert.equal(t.paymentRow, jobCancelled ? 'expired' : 'failed');
    if (!jobCancelled) assert.ok(summary.skipped.includes(number));
    else assert.deepEqual([cancelRes.status, cancelRes.body.message], [409, 'Pesanan ini sudah dibatalkan.']);
    assert.deepEqual(after, { sold: before.sold - 2, quota: before.quota + 1, balance: before.balance + t.pointsUsed });
  });
}

// ── M4 ───────────────────────────────────────────────────────────────────────────────────────────

test('M4 dua PROSES job: antre kunci pesanan yang sama, lalu 10 pesanan bersamaan → setiap pesanan dibatalkan tepat sekali', async () => {
  // (a) deterministik: kedua proses menunggu kunci baris yang sama
  const customer = await customerWithBenefits();
  const number = await placeOrder(customer, { benefits: true });
  const expiredAt = await setExpiry(number, -60000);
  const hold = holdOrder(number);
  await hold.ready;
  const procs = [runJobProcess(justAfter(expiredAt)), runJobProcess(justAfter(expiredAt))];
  await waitForAppLockWait((w) => w.waiting_table === 'orders', { timeoutMs: 15000 });
  await waitForAppLockWaits(2, { timeoutMs: 15000 });
  await hold.release();
  const results = await Promise.all(procs);
  const t = await trail(number);
  const winners = results.filter((r) => r.cancelled.includes(number)).length;
  const skippers = results.filter((r) => r.skipped.includes(number)).length;
  record(FILE, 'M4a', { results, t });
  assert.deepEqual([winners, skippers], [1, 1], JSON.stringify(results));
  assertAutoCancelledOnce(t, 'M4a');

  // (b) 10 pesanan (5 pelanggan) diproses dua proses bersamaan
  const numbers = [];
  const customers = [];
  for (let i = 0; i < 5; i += 1) {
    const c = await customerWithBenefits();
    customers.push(c);
    numbers.push(await placeOrder(c, { benefits: true }), await placeOrder(c));
  }
  for (const n of numbers) await setExpiry(n, -60000);
  const sold = await stockSold();
  const quotaBefore = await quota();
  const metricsBefore = await innodbMetrics();
  const both = await Promise.all([runJobProcess(new Date()), runJobProcess(new Date())]);
  const cancelledAll = both.flatMap((r) => r.cancelled).filter((n) => numbers.includes(n));
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  record(FILE, 'M4b', { both: both.map((r) => ({ c: r.cancelled.length, s: r.skipped.length, f: r.failed })), deadlocks });
  assert.equal(cancelledAll.length, numbers.length, 'setiap pesanan dibatalkan');
  assert.equal(new Set(cancelledAll).size, numbers.length, 'tidak ada pesanan yang dibatalkan dua proses');
  assert.deepEqual(both.flatMap((r) => r.failed), []);
  for (const n of numbers) assertAutoCancelledOnce(await trail(n), `M4b ${n}`);
  assert.equal(await stockSold(), sold - 2 * numbers.length, 'stok kembali tepat sekali per pesanan');
  assert.equal(await quota(), quotaBefore + customers.length, 'kuota voucher kembali tepat sekali per pesanan bervoucher');
  for (const c of customers) assert.equal(await balance(c), 300, 'saldo poin kembali utuh');
  assert.equal(deadlocks, 0);
});

// ── M5 ───────────────────────────────────────────────────────────────────────────────────────────

test('M5 job × checkout pelanggan yang sama (F-C1-1): job menunggu users tanpa memegang kunci payments → 0 deadlock', async () => {
  const results = [];
  for (let round = 0; round < 3; round += 1) {
    const customer = await customerWithBenefits();
    const number = await placeOrder(customer, { benefits: true }); // pesanan terbaru → entri terakhir indeks payments
    const expiredAt = await setExpiry(number, -60000);
    const metricsBefore = await innodbMetrics();
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    await checkoutTx.ready;
    const jobRun = job.runAutoCancel({ now: justAfter(expiredAt) });
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
    const conn = waits.find((w) => w.waiting_table === 'users').waiting_conn;
    const held = (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.lock_mode}`);
    const checkout = await checkoutTx.release(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      unique('M5-').slice(0, 20), customer);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe(`INSERT INTO payments (order_id, method_code, amount, status, expired_at)
        VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)`, id);
    }).then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(0, 120)}`);
    const summary = await jobRun;
    await sleep(150);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = { round, held, checkout, cancelled: summary.cancelled.includes(number), failed: summary.failed, deadlocks };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    results.push(result);
    assert.ok(held.some((l) => l.startsWith('orders:X')), `job memegang kunci pesanan: ${held}`);
    assert.ok(!held.some((l) => l.startsWith('payments:')), `job belum memegang kunci payments: ${held}`);
    assert.equal(checkout, 'commit');
    assert.ok(result.cancelled, JSON.stringify(summary));
    assert.equal(deadlocks, 0);
    assertAutoCancelledOnce(await trail(number), `M5 ${round}`);
  }
  record(FILE, 'M5', { results });
});

// ── M6 ───────────────────────────────────────────────────────────────────────────────────────────

test('M6 rollback: notifikasi satu pesanan ditolak MySQL → pesanan itu utuh (tanpa data parsial), pesanan lain dibatalkan; lalu pulih', async () => {
  const customer = await customerWithBenefits();
  const failing = await placeOrder(customer, { benefits: true });
  const other = await placeOrder(await customerWithBenefits());
  for (const n of [failing, other]) await setExpiry(n, -60000);
  const [{ order_id: failingId }] = await rows('SELECT order_id FROM orders WHERE order_number = ?', failing);
  const before = {
    t: await trail(failing), balance: await balance(customer), claimUsed: await claimUsed(customer),
    items: await rows('SELECT COUNT(*) AS n FROM notifications WHERE order_id = ?', failingId),
  };
  const sold = await stockSold();
  const quotaBefore = await quota();
  // Menolak INSERT notifikasi poin refund pesanan ini — SETELAH refund poin, riwayat & notifikasi status ditulis
  mysqlCli(`DELIMITER //
    CREATE TRIGGER c2_fail_notification BEFORE INSERT ON notifications FOR EACH ROW
    BEGIN IF NEW.order_id = ${Number(failingId)} AND NEW.type = 'points' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'uji rollback C2'; END IF; END//
    DELIMITER ;`);
  let summary;
  try {
    summary = await job.runAutoCancel({ now: new Date() });
  } finally {
    dropTrigger();
  }
  const afterFail = { t: await trail(failing), balance: await balance(customer), claimUsed: await claimUsed(customer) };
  record(FILE, 'M6', { summary: { cancelled: summary.cancelled.filter((n) => [failing, other].includes(n)), failed: summary.failed }, before, afterFail });
  assert.deepEqual(summary.failed.map((f) => f.order_number), [failing]);
  assert.match(summary.failed[0].error, /uji rollback C2/);
  assert.ok(summary.cancelled.includes(other));
  assert.deepEqual(afterFail.t, before.t, 'status, pembayaran, riwayat, notifikasi, refund pesanan gagal tidak berubah');
  assert.equal(afterFail.balance, before.balance);
  assert.equal(afterFail.claimUsed, true, 'klaim voucher tetap terpakai');
  assert.equal(await stockSold(), sold - 2, 'hanya stok pesanan lain yang kembali');
  assert.equal(await quota(), quotaBefore, 'pesanan lain tanpa voucher; kuota pesanan gagal tidak berubah');
  assertAutoCancelledOnce(await trail(other), 'M6 pesanan lain');

  // Putaran berikutnya (trigger sudah dihapus) membatalkan pesanan yang tadi gagal
  const retry = await job.runAutoCancel({ now: new Date() });
  assert.ok(retry.cancelled.includes(failing));
  assertAutoCancelledOnce(await trail(failing), 'M6 ulang');
  assert.equal(await balance(customer), 300);
  assert.equal(await quota(), quotaBefore + 1);
});

// ── M7 ───────────────────────────────────────────────────────────────────────────────────────────

test(`M7 beban × ${ROUNDS_M7}: 2 pelari job + simulasi lunas + batal + checkout bersamaan → tanpa 5xx, 0 deadlock, konsisten`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  const bump = (key) => { statuses[key] = (statuses[key] ?? 0) + 1; };
  for (let round = 0; round < ROUNDS_M7; round += 1) {
    const customer = await customerWithBenefits();
    const racePay = await placeOrder(customer, { benefits: true }); // dibayar vs job
    const raceCancel = await placeOrder(customer); // dibatalkan pelanggan vs job
    const expired = await placeOrder(customer); // hanya job
    const raceExpiry = await setExpiry(racePay, 1500);
    await setExpiry(raceCancel, -60000);
    await setExpiry(expired, -60000);
    const body = await orderBody(customer);
    const now = justAfter(raceExpiry);
    const [jobA, jobB, pay, cancel, checkout] = await Promise.all([
      job.runAutoCancel({ now }),
      sleep(round % 4).then(() => job.runAutoCancel({ now })),
      call(server, 'POST', `/api/payments/${racePay}/simulate-paid`, { userId: customer }),
      call(server, 'PATCH', `/api/orders/${raceCancel}/cancel`, { userId: customer, body: { reason: 'Uji M7' } }),
      call(server, 'POST', '/api/orders', { userId: customer, body }),
    ]);
    bump(`pay ${pay.status}`);
    bump(`cancel ${cancel.status}`);
    bump(`checkout ${checkout.status}`);
    const failed = [...jobA.failed, ...jobB.failed];
    if (failed.length) violations.push({ round, failed });
    for (const n of [racePay, raceCancel, expired]) {
      const t = await trail(n);
      const cancelledBy = [jobA, jobB].filter((r) => r.cancelled.includes(n)).length;
      if (cancelledBy > 1) violations.push({ round, n, doubleJob: true });
      if (t.status === 'dibatalkan') {
        if (t.cancelHistories !== 1 || t.cancelNotices !== 1) violations.push({ round, n, t });
        if (t.refunds !== (t.pointsUsed > 0 ? 1 : 0)) violations.push({ round, n, refunds: t.refunds });
        if (!['expired', 'failed'].includes(t.paymentRow)) violations.push({ round, n, paymentRow: t.paymentRow });
      } else if (!(t.status === 'dikonfirmasi' && t.paymentRow === 'paid' && t.cancelHistories === 0)) {
        violations.push({ round, n, t });
      }
      if (t.histories !== t.statusNotices) violations.push({ round, n, mismatch: t });
    }
    const payT = await trail(racePay);
    if ((pay.status === 200) === (payT.status === 'dibatalkan')) violations.push({ round, payXor: [pay.status, payT.status] });
    // Poin & klaim voucher kembali utuh bila pesanan bervoucher dibatalkan; tetap terpakai bila lunas
    if (payT.status === 'dibatalkan' && ((await balance(customer)) !== 300 || (await claimUsed(customer)))) violations.push({ round, benefits: true });
    if (payT.status === 'dikonfirmasi' && (await balance(customer)) !== 300 - payT.pointsUsed) violations.push({ round, balance: await balance(customer) });
  }
  // Stok: qty_sold = jumlah item produk uji pada pesanan yang TIDAK dibatalkan (semua dibuat hari ini)
  const [{ n: live }] = await rows(`SELECT COALESCE(SUM(i.quantity), 0) AS n FROM order_items i JOIN orders o ON o.order_id = i.order_id
    WHERE i.product_id = ? AND o.order_status <> 'dibatalkan'`, readyProduct);
  const sold = await stockSold();
  if (Number(live) !== sold) violations.push({ stock: { live: Number(live), sold } });
  await sleep(200);
  const summary = {
    statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks,
    leftover: await appHeldLocks(), waits: await appLockWaits(),
  };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'M7', summary);
  assert.ok(Object.keys(statuses).every((k) => / (200|201|409)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});

// ── M8 / M9 ──────────────────────────────────────────────────────────────────────────────────────

/** Server API asli dengan penjadwal aktif (NODE_ENV=development) → {child, logPath, readLog, exited} */
function startSchedulerServer(name) {
  const logPath = path.join(ARTIFACT_DIR, `server-${FILE}-${name}.log`);
  const log = fs.openSync(logPath, 'w');
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: APP_URL, PORT: String(port), JWT_SECRET: `${name}-only`, NODE_ENV: 'development' },
    stdio: ['ignore', log, log],
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => { fs.closeSync(log); resolve({ code, signal }); }));
  return { child, logPath, exited, readLog: () => fs.readFileSync(logPath, 'utf8') };
}

test('M8 penjadwal asli: server NODE_ENV=development membatalkan pesanan lewat batas saat start; SIGTERM keluar bersih', async () => {
  const customer = await customerWithBenefits();
  const number = await placeOrder(customer, { benefits: true });
  await setExpiry(number, -60000);
  const { child, exited, readLog } = startSchedulerServer('m8');
  try {
    let t;
    for (let i = 0; i < 100; i += 1) {
      t = await trail(number);
      if (t.status === 'dibatalkan') break;
      await sleep(100);
    }
    assertAutoCancelledOnce(t, 'M8');
    child.kill('SIGTERM');
    const exit = await exited;
    const text = readLog();
    record(FILE, 'M8', { exit, log: text.split('\n').filter((l) => /Job|SIGTERM|DEV EMAIL/.test(l)).slice(0, 20) });
    assert.match(text, /\[Job autoCancelOrders\] Aktif \(\* \* \* \* \*\)\./);
    assert.match(text, new RegExp(`BR-06: \\d+ dibatalkan.*${number}`));
    assert.ok(text.includes(`[DEV EMAIL]`) && text.includes(`Pesanan ${number} dibatalkan. Alasan: ${REASON}`), 'email setelah commit');
    assert.match(text, /SIGTERM diterima/);
    assert.deepEqual(exit, { code: 0, signal: null }, 'keluar bersih setelah menunggu job & menutup koneksi');
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});

/**
 * M9: kandidat A (pelanggan yang baris users-nya dipegang "checkout" harness) lalu B & C. Job server asli mengunci
 * pesanan A dan menunggu users S; SIGTERM dikirim saat itu juga.
 */
async function shutdownWhileJobHoldsLock(label, { holdMs }) {
  await job.runAutoCancel({ now: new Date() }); // bersihkan kandidat lama agar A diproses pertama
  const customer = await customerWithBenefits();
  const numbers = [await placeOrder(customer, { benefits: true }), await placeOrder(await customerWithBenefits()), await placeOrder(await customerWithBenefits())];
  for (const n of numbers) await setExpiry(n, -60000);
  const before = await Promise.all(numbers.map(trail));
  const benefitsBefore = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
  const metricsBefore = await innodbMetrics();

  const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
  await checkoutTx.ready;
  const srv = startSchedulerServer(label);
  try {
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer), { timeoutMs: 15000 });
    const conn = String(waits.find((w) => w.waiting_table === 'users').waiting_conn);
    const heldBefore = (await appHeldLocks()).filter((l) => String(l.conn) === conn).map((l) => `${l.table_name}:${l.lock_mode}`);
    srv.child.kill('SIGTERM');
    await sleep(400);
    const afterSigterm = {
      processAlive: srv.child.exitCode === null,
      jobTxOpen: (await appOpenTransactions()).some((trx) => String(trx.conn) === conn),
      heldLocks: (await appHeldLocks()).filter((l) => String(l.conn) === conn).map((l) => `${l.table_name}:${l.lock_mode}`),
    };
    if (holdMs > 400) await sleep(holdMs - 400);
    await checkoutTx.release();
    const exit = await srv.exited;
    const after = await Promise.all(numbers.map(trail));
    const benefitsAfter = { sold: await stockSold(), quota: await quota(), balance: await balance(customer) };
    const text = srv.readLog();
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = {
      heldBefore, afterSigterm, exit, deadlocks, numbers, before, after, benefitsBefore, benefitsAfter,
      log: text.split('\n').filter((l) => /Job|SIGTERM|DEV EMAIL/.test(l)),
      leftover: await appHeldLocks(),
    };
    record(FILE, label, result);
    return { ...result, text };
  } finally {
    if (srv.child.exitCode === null) srv.child.kill('SIGKILL');
  }
}

function assertShutdownWaited(r) {
  assert.ok(r.heldBefore.some((l) => l.startsWith('orders:X')), `job memegang kunci pesanan: ${r.heldBefore}`);
  assert.equal(r.afterSigterm.processAlive, true, 'proses tetap hidup setelah SIGTERM selama transaksi job berjalan');
  assert.equal(r.afterSigterm.jobTxOpen, true, 'transaksi job masih terbuka (koneksi belum diputus) setelah SIGTERM');
  assert.ok(r.afterSigterm.heldLocks.some((l) => l.startsWith('orders:X')), 'kunci pesanan masih dipegang transaksi job');
  assert.deepEqual(r.exit, { code: 0, signal: null }, 'keluar bersih setelah transaksi selesai & disconnect');
  assert.equal(r.deadlocks, 0);
  assert.deepEqual(r.leftover, []);
  // Urutan log: SIGTERM → (hasil pesanan A) → kandidat tersisa tidak diproses
  const sigterm = r.text.indexOf('SIGTERM diterima');
  const stopped = r.text.indexOf('Shutdown diminta — 2 kandidat tersisa tidak diproses.');
  assert.ok(sigterm >= 0 && stopped > sigterm, 'kandidat berikutnya tidak diproses setelah shutdown diminta');
  // B & C tidak disentuh sama sekali
  assert.deepEqual(r.after.slice(1), r.before.slice(1), 'pesanan berikutnya tanpa perubahan');
}

test('M9a SIGTERM saat job memegang kunci & transaksi berjalan → transaksi commit utuh, kandidat berikutnya dilewati, exit 0', async () => {
  const r = await shutdownWhileJobHoldsLock('m9a', { holdMs: 400 });
  assertShutdownWaited(r);
  assertAutoCancelledOnce(r.after[0], 'M9a pesanan yang sedang diproses');
  assert.deepEqual(r.benefitsAfter, {
    sold: r.benefitsBefore.sold - 2, quota: r.benefitsBefore.quota + 1, balance: r.benefitsBefore.balance + r.after[0].pointsUsed,
  });
  assert.ok(r.text.indexOf(`Pesanan ${r.numbers[0]} dibatalkan. Alasan:`) > r.text.indexOf('SIGTERM diterima'), 'email setelah commit, sebelum exit');
});

test('M9b SIGTERM saat job menunggu kunci > batas lock wait → transaksi rollback 1205 utuh, kandidat berikutnya dilewati, exit 0', async () => {
  const r = await shutdownWhileJobHoldsLock('m9b', { holdMs: 3000 });
  assertShutdownWaited(r);
  assert.deepEqual(r.after[0], r.before[0], 'pesanan yang di-rollback tanpa data parsial');
  assert.deepEqual(r.benefitsAfter, r.benefitsBefore, 'stok, voucher, poin tidak berubah');
  assert.match(r.text, new RegExp(`Gagal membatalkan ${r.numbers[0]} \\(BR-06\\).*(1205|Lock wait timeout)`));
  assert.ok(!r.text.includes(`Pesanan ${r.numbers[0]} dibatalkan. Alasan:`), 'tanpa email untuk transaksi yang di-rollback');
});

// ── M10 ──────────────────────────────────────────────────────────────────────────────────────────

/** Sesi mysql terpisah memegang LOCK TABLES orders WRITE selama holdSeconds (metadata lock eksklusif) */
async function holdOrdersMetadataLock(holdSeconds) {
  const password = decodeURIComponent(new URL(process.env.ROOT_DATABASE_URL).password);
  const child = spawn('docker', ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${password}`, DATABASE]);
  child.stdin.end(`LOCK TABLES orders WRITE; SELECT SLEEP(${holdSeconds}); UNLOCK TABLES;\n`);
  const released = new Promise((resolve) => child.once('exit', resolve));
  for (let i = 0; ; i += 1) {
    const [held] = await rows("SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE USER = 'root' AND INFO LIKE 'SELECT SLEEP(%'");
    if (Number(held.n) > 0) break;
    if (i > 200) throw new Error('LOCK TABLES tidak diperoleh');
    await sleep(25);
  }
  return { released, kill: () => child.kill('SIGKILL') };
}

/** Query kandidat aplikasi yang sedang tertahan metadata lock (PROCESSLIST tidak menyentuh tabel orders) */
const blockedCandidateQueries = () => rows(`SELECT ID AS id, STATE AS state, TIME AS seconds FROM information_schema.PROCESSLIST
  WHERE USER = 'c4app' AND INFO LIKE '%MAX_EXECUTION_TIME%'`);

async function waitForBlockedCandidateQuery() {
  for (let i = 0; i < 400; i += 1) {
    const list = await blockedCandidateQueries();
    if (list.some((q) => /metadata lock/i.test(q.state))) return list;
    await sleep(25);
  }
  throw new Error('query kandidat tidak terlihat menunggu metadata lock');
}

test('M10a query kandidat tertahan metadata lock → MySQL menghentikannya ±5 s (ER 3024), dicatat, tanpa transaksi', async () => {
  await job.runAutoCancel({ now: new Date() });
  const number = await placeOrder(await customerWithBenefits());
  await setExpiry(number, -60000);
  const before = await trail(number);
  const lock = await holdOrdersMetadataLock(12);
  try {
    const started = Date.now();
    const pending = job.runAutoCancel({ now: new Date() });
    const blocked = await waitForBlockedCandidateQuery();
    const summary = await pending;
    const ms = Date.now() - started;
    const stillLocked = (await rows("SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE USER = 'root' AND INFO LIKE 'SELECT SLEEP(%'"))[0].n;
    record(FILE, 'M10a', { blocked, summary, ms, stillLocked });
    assert.match(summary.queryError, /3024/);
    assert.deepEqual([summary.cancelled, summary.skipped, summary.failed], [[], [], []]);
    assert.ok(ms >= 4500 && ms < 8000, `berhenti oleh MAX_EXECUTION_TIME (±5 s), ms=${ms}`);
    assert.equal(Number(stillLocked), 1, 'berhenti SEBELUM pemegang lock melepas — batasnya dari MySQL, bukan dari lock');
  } finally {
    lock.kill();
    await lock.released;
  }
  await sleep(200);
  assert.deepEqual(await trail(number), before, 'tanpa data parsial');
  assert.ok((await job.runAutoCancel({ now: new Date() })).cancelled.includes(number), 'putaran berikutnya normal');
});

for (const [label, lockSeconds, outcome] of [['M10b', 12, 'timeout'], ['M10c', 2, 'selesai']]) {
  test(`${label} SIGTERM saat query kandidat tertahan metadata lock, lalu query ${outcome} → disconnect setelah query berhenti, tanpa transaksi, exit 0`, async () => {
    await job.runAutoCancel({ now: new Date() });
    const number = await placeOrder(await customerWithBenefits());
    await setExpiry(number, -60000);
    const before = await trail(number);
    const lock = await holdOrdersMetadataLock(lockSeconds);
    const srv = startSchedulerServer(label.toLowerCase());
    try {
      const blocked = await waitForBlockedCandidateQuery();
      const sigtermAt = Date.now();
      srv.child.kill('SIGTERM');
      await sleep(400);
      const afterSigterm = { processAlive: srv.child.exitCode === null, queryRunning: (await blockedCandidateQueries()).length > 0 };
      const exit = await srv.exited;
      const exitMs = Date.now() - sigtermAt;
      const lockStillHeld = Number((await rows("SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE USER = 'root' AND INFO LIKE 'SELECT SLEEP(%'"))[0].n);
      const text = srv.readLog();
      record(FILE, label, { blocked, afterSigterm, exit, exitMs, lockStillHeld, log: text.split('\n').filter((l) => /Job|SIGTERM/.test(l)) });
      assert.deepEqual(afterSigterm, { processAlive: true, queryRunning: true }, 'shutdown menunggu query kandidat yang masih berjalan');
      assert.deepEqual(exit, { code: 0, signal: null });
      assert.equal((await blockedCandidateQueries()).length, 0, 'tidak ada query kandidat tersisa');
      if (outcome === 'timeout') {
        assert.match(text, /Query kandidat BR-06 gagal, dicoba lagi putaran berikutnya — .*3024/);
        assert.equal(lockStillHeld, 1, 'keluar SEBELUM pemegang lock melepas (dibatasi MAX_EXECUTION_TIME)');
        assert.ok(exitMs < 8000, `exitMs=${exitMs}`);
      } else {
        assert.match(text, /Shutdown diminta — \d+ kandidat tersisa tidak diproses\./);
        assert.ok(!/Query kandidat BR-06 gagal/.test(text));
      }
      assert.ok(text.indexOf('SIGTERM diterima') >= 0);
    } finally {
      if (srv.child.exitCode === null) srv.child.kill('SIGKILL');
      lock.kill();
      await lock.released;
    }
    await sleep(200);
    assert.deepEqual(await trail(number), before, 'tidak ada transaksi kandidat setelah shutdown — pesanan tidak berubah');
  });
}
