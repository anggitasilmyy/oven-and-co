// tests-mysql/14-auto-cancel-pay-at-store.it.test.js
// Step 6.5 C3 · FR-38 · BR-07 (+ temuan F-C3-1) — MySQL 8 sungguhan. Job dijalankan di proses uji (akun aplikasi c4app,
// src/lib/prisma) dan di proses anak terpisah; `now` job disuntikkan (tidak bergantung jam nyata).
// Q1/Q2 F-C3-1: pembatalan pesanan terbaru A × checkout pelanggan LAIN yang memegang daily_stocks produk yang sama lalu
//    INSERT payments (lintas pelanggan → kunci users tidak menyerialkan). Q2b = versi job BR-07.
// P1 job BR-07 normal (sebelum/tepat/sesudah jam tutup, ketiga status D1, lunas/Selesai/masa depan tidak, efek, idempoten,
//    baris jam tidak ada → default, hari tutup → fallback H1). P2 × tandai lunas, P3 × ubah status admin, P4 × batal
//    pelanggan (dua urutan antre). P5 dua proses job. P6 × checkout pelanggan yang sama (F-C1-1). P7 rollback (trigger).
//    P8 beban campuran × 15. P9 SIGTERM saat transaksi BR-07 memegang kunci.
// H4-a…h jam operasional TERBARU (AD-11 asli / transaksi peniru AD-11): diperpanjang setelah snapshot, AD-11 belum commit
//    (commit / rollback), baris jam tidak ada (INSERT AD-11), job lebih dulu memegang jam, dimajukan, hari ditutup, siklus
//    tiga pihak (job × checkout × AD-11), beban dengan AD-11 bolak-balik.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APP_URL, db, rows, holdTransaction, waitForAppLockWait, waitForAppLockWaits, appHeldLocks, appLockWaits, innodbMetrics,
  latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { addDaysToDateKey } = require('../src/utils/jakartaDate');
const { dayOfWeekOf } = require('../src/services/operatingHours.service');
const { startServer, call } = require('./helpers/server');
const { createUser } = require('./helpers/fixtures');
const { createAutoCancelFixtures } = require('./helpers/autoCancelFixtures');

process.env.DATABASE_URL = APP_URL;
const job = require('../src/jobs/autoCancelOrders');
const appPrisma = require('../src/lib/prisma');

const FILE = '14-auto-cancel-pay-at-store';
const BR06_REASON = 'Tidak dibayar dalam 30 menit (BR-06)';
const BR07_REASON = 'Tidak diambil sampai jam tutup (BR-07)';
const ROUNDS_P8 = Number(process.env.C4_ROUNDS_P8 || 15);
const ROUNDS_H4H = Number(process.env.C4_ROUNDS_H4H || 15);
let server;
let owner;
let staff;
const fx = createAutoCancelFixtures({ label: 'C3', getServer: () => server });

test.before(async () => {
  await fx.setup();
  server = await startServer(FILE);
  owner = await createUser('owner');
  staff = await createUser('staf');
});
test.after(async () => {
  await server?.stop();
  await appPrisma.$disconnect();
  await db.$disconnect();
});

// ── Q1 / Q2: F-C3-1 ──────────────────────────────────────────────────────────────────────────────

/**
 * A = pesanan terbaru pelanggan 1 (entri terakhir indeks payments_order_id_fkey, stok ready hari ini). Checkout pelanggan 2
 * (harness) memegang daily_stocks produk yang sama; pembatalan A dimulai dan menunggu daily_stocks; checkout lalu INSERT
 * pesanan + pembayaran baru. Siklus bila pembatalan memegang gap payments.
 */
async function cancelVsOtherCustomerCheckout(label, startCancel) {
  await job.runAutoCancel({ now: new Date() }); // bersihkan kandidat lama
  const customer = await fx.customerWithBenefits();
  const other = await createUser('customer');
  const number = await fx.placeOrder(customer, { benefits: true });
  const before = await fx.benefits(customer);
  const metricsBefore = await innodbMetrics();
  const checkout = fx.holdCheckoutStock(other);
  await checkout.ready;
  const cancel = startCancel(number, customer);
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'daily_stocks', { timeoutMs: 15000 });
  const conn = String(waits.find((w) => w.waiting_table === 'daily_stocks').waiting_conn);
  const held = (await appHeldLocks()).filter((l) => String(l.conn) === conn).map((l) => `${l.table_name}:${l.index_name ?? ''}:${l.lock_mode}:${l.lock_data ?? ''}`);
  const checkoutResult = await checkout.finish();
  const cancelResult = await cancel;
  await sleep(200);
  const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
  const t = await fx.trail(number);
  const after = await fx.benefits(customer);
  const result = { label, held, checkoutResult, cancelResult, deadlocks, t, before, after };
  if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
  record(FILE, label, result);
  return result;
}

test('Q1 F-C3-1: batal pelanggan (pesanan terbaru) × checkout pelanggan LAIN produk yang sama → tanpa deadlock, data konsisten', async () => {
  const r = await cancelVsOtherCustomerCheckout('Q1', (number, customer) => call(server, 'PATCH', `/api/orders/${number}/cancel`, {
    userId: customer, body: { reason: 'Uji F-C3-1' },
  }).then((res) => res.status));
  assert.ok(!r.held.some((l) => l.startsWith('payments:payments_order_id_fkey')), `pembatalan tidak memegang kunci indeks payments_order_id_fkey: ${r.held.join(' | ')}`);
  assert.equal(r.checkoutResult, 'commit');
  assert.equal(r.cancelResult, 200);
  assert.equal(r.deadlocks, 0);
  assert.deepEqual([r.t.status, r.t.paymentRow, r.t.refunds, r.t.cancelHistories], ['dibatalkan', 'failed', 1, 1]);
  assert.deepEqual(r.after, { sold: r.before.sold - 2 + 1, quota: r.before.quota + 1, balance: 300, claimUsed: false });
});

test('Q2a F-C3-1: job BR-06 (pesanan terbaru) × checkout pelanggan LAIN produk yang sama → tanpa deadlock, data konsisten', async () => {
  const r = await cancelVsOtherCustomerCheckout('Q2a', async (number) => {
    const expiredAt = await fx.setExpiry(number, -60000);
    return job.runAutoCancel({ now: new Date(expiredAt.getTime() + 60000) });
  });
  assert.ok(!r.held.some((l) => l.startsWith('payments:payments_order_id_fkey')), `job tidak memegang kunci indeks payments_order_id_fkey: ${r.held.join(' | ')}`);
  assert.equal(r.checkoutResult, 'commit');
  assert.deepEqual(r.cancelResult.failed, []);
  assert.equal(r.deadlocks, 0);
  fx.assertAutoCancelledOnce(r.t, BR06_REASON, 'Q2a');
  assert.deepEqual(r.after, { sold: r.before.sold - 2 + 1, quota: r.before.quota + 1, balance: 300, claimUsed: false });
});

// ── Alat BR-07 ───────────────────────────────────────────────────────────────────────────────────

/** Tanggal siap uji: lusa (hari D) — `now` job disuntikkan di sekitar jam tutup hari D */
const D = () => addDaysToDateKey(fx.today(), 2);
const DW = () => dayOfWeekOf(D());
const wib = (dateKey, hhmmss, ms = 0) => new Date(new Date(`${dateKey}T${hhmmss}+07:00`).getTime() + ms);
const runAt = (now) => job.runAutoCancel({ now });

const saveHours = () => rows("SELECT hour_id, day_of_week, TIME_FORMAT(open_time, '%H:%i:%s') AS o, TIME_FORMAT(close_time, '%H:%i:%s') AS c, is_open FROM operating_hours");
async function restoreHours(saved) {
  await db.$executeRawUnsafe('DELETE FROM operating_hours');
  for (const h of saved) {
    await db.$executeRawUnsafe('INSERT INTO operating_hours (hour_id, day_of_week, open_time, close_time, is_open) VALUES (?, ?, ?, ?, ?)',
      h.hour_id, h.day_of_week, h.o, h.c, h.is_open);
  }
}
/** Penyiapan langsung (bukan aksi yang diuji) */
const setCloseSql = (day, close, isOpen = 1) => db.$executeRawUnsafe('UPDATE operating_hours SET close_time = ?, is_open = ? WHERE day_of_week = ?', close, isOpen, day);
/** AD-11 asli: PUT 7 baris; hari `day` diganti */
async function putHours(day, { close, isOpen = true }) {
  const current = await rows("SELECT day_of_week, TIME_FORMAT(open_time, '%H:%i') AS o, TIME_FORMAT(close_time, '%H:%i') AS c, is_open FROM operating_hours");
  const hours = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const row = current.find((h) => Number(h.day_of_week) === d);
    const base = { day_of_week: d, is_open: row ? row.is_open === 1 : true, open_time: row?.o ?? '07:00', close_time: row?.c ?? '20:00' };
    return d === day ? { ...base, is_open: isOpen, close_time: close } : base;
  });
  return call(server, 'PUT', '/api/admin/settings/operating-hours', { userId: owner, body: { hours } });
}

/** Pesanan Bayar di Toko (checkout asli lalu penyiapan SQL) */
async function payAtStoreOrder(customer, { status = 'dikonfirmasi', benefits = false, readyDate = D() } = {}) {
  const number = await fx.placeOrder(customer, { benefits });
  await fx.makePayAtStore(number, { status, readyDate });
  return number;
}
const markPaid = (number) => call(server, 'PATCH', `/api/admin/orders/${number}/mark-paid`, { userId: staff });
const changeStatus = (number, from, to) => call(server, 'PATCH', `/api/admin/orders/${number}/status`, { userId: staff, body: { from, to } });
const orderLockWaiters = () => waitForAppLockWaits(2);

// ── P1 ───────────────────────────────────────────────────────────────────────────────────────────

test('P1 BR-07 normal: tepat jam tutup belum, sesudahnya ketiga status D1 dibatalkan; lunas/Selesai/masa depan tidak; idempoten', async () => {
  const saved = await saveHours();
  try {
    await setCloseSql(DW(), '20:00:00');
    await runAt(wib(D(), '20:00:01')); // bersihkan kandidat lama sampai hari D
    const customer = await fx.customerWithBenefits();
    const a = await payAtStoreOrder(customer, { benefits: true });
    const b = await payAtStoreOrder(await fx.customerWithBenefits(), { status: 'sedang_disiapkan' });
    const c = await payAtStoreOrder(await fx.customerWithBenefits(), { status: 'siap_diambil' });
    const paid = await payAtStoreOrder(await fx.customerWithBenefits(), { status: 'siap_diambil' });
    await db.$executeRawUnsafe("UPDATE orders SET payment_status = 'paid' WHERE order_number = ?", paid);
    await db.$executeRawUnsafe("UPDATE payments SET status = 'paid' WHERE order_id = ?", await fx.orderIdOf(paid));
    const done = await payAtStoreOrder(await fx.customerWithBenefits(), { status: 'selesai' });
    await db.$executeRawUnsafe("UPDATE orders SET payment_status = 'paid' WHERE order_number = ?", done);
    const future = await payAtStoreOrder(await fx.customerWithBenefits(), { readyDate: addDaysToDateKey(D(), 1) });
    const before = await fx.benefits(customer);

    // payments.expired_at (30 menit online lama) SUDAH lewat, tetapi BR-07 memakai jam tutup → belum dibatalkan
    const atClose = await runAt(wib(D(), '20:00:00'));
    assert.ok(![a, b, c].some((n) => atClose.cancelled.includes(n)), JSON.stringify(atClose));
    const summary = await runAt(wib(D(), '20:00:01'));
    record(FILE, 'P1', { summary: { c: summary.cancelled, f: summary.failed } });
    for (const n of [a, b, c]) {
      assert.ok(summary.cancelled.includes(n), n);
      fx.assertAutoCancelledOnce(await fx.trail(n), BR07_REASON, `P1 ${n}`);
    }
    for (const n of [paid, done, future]) assert.ok(!summary.cancelled.includes(n) && (await fx.trail(n)).status !== 'dibatalkan', n);
    const t = await fx.trail(a);
    // a, b, c masing-masing 2 item produk uji → stok kembali 6; voucher & poin hanya milik a
    assert.deepEqual(await fx.benefits(customer), { sold: before.sold - 6, quota: before.quota + 1, balance: before.balance + t.pointsUsed, claimUsed: false });
    const again = await runAt(wib(D(), '21:00:00'));
    assert.ok(![a, b, c].some((n) => again.cancelled.includes(n) || again.skipped.includes(n)));
    assert.deepEqual(await fx.trail(a), t);
  } finally {
    await restoreHours(saved);
  }
});

test('P1b baris operating_hours hari D tidak ada → default 07.00–20.00 (TF-10); hari D ditutup → fallback 00.00 WIB hari berikutnya', async () => {
  const saved = await saveHours();
  try {
    await db.$executeRawUnsafe('DELETE FROM operating_hours WHERE day_of_week = ?', DW());
    const missing = await payAtStoreOrder(await fx.customerWithBenefits());
    assert.ok(!(await runAt(wib(D(), '20:00:00'))).cancelled.includes(missing));
    assert.ok((await runAt(wib(D(), '20:00:01'))).cancelled.includes(missing), 'default 20.00');
    fx.assertAutoCancelledOnce(await fx.trail(missing), BR07_REASON, 'P1b default');

    await restoreHours(saved);
    await setCloseSql(DW(), '20:00:00', 0); // hari D ditutup setelah pesanan dibuat
    const closed = await payAtStoreOrder(await fx.customerWithBenefits());
    assert.ok(!(await runAt(wib(D(), '23:59:59', 999))).cancelled.includes(closed));
    assert.ok((await runAt(wib(addDaysToDateKey(D(), 1), '00:00:00'))).cancelled.includes(closed), 'fallback 00.00 berikutnya');
    fx.assertAutoCancelledOnce(await fx.trail(closed), BR07_REASON, 'P1b fallback');
  } finally {
    await restoreHours(saved);
  }
});

// ── P2 / P3 / P4: dua urutan antre kunci ─────────────────────────────────────────────────────────

/** Harness memegang orders X; `first` dan `second` mulai antre berurutan; lepas → hasil keduanya */
async function queueOnOrder(number, first, second) {
  const hold = fx.holdOrder(number);
  await hold.ready;
  const p1 = first();
  await waitForAppLockWaits(1);
  const p2 = second();
  await orderLockWaiters();
  await hold.release();
  return Promise.all([p1, p2]);
}

for (const order of ['job', 'admin']) {
  test(`P2 BR-07 × tandai lunas (Siap Diambil), ${order} antre lebih dulu → lunas XOR batal`, async () => {
    const customer = await fx.customerWithBenefits();
    const number = await payAtStoreOrder(customer, { status: 'siap_diambil', benefits: true });
    const before = await fx.benefits(customer);
    const metricsBefore = await innodbMetrics();
    const jobRun = () => runAt(wib(D(), '20:00:01'));
    const pay = () => markPaid(number);
    const [x, y] = await queueOnOrder(number, order === 'job' ? jobRun : pay, order === 'job' ? pay : jobRun);
    const [summary, payRes] = order === 'job' ? [x, y] : [y, x];
    const t = await fx.trail(number);
    record(FILE, `P2-${order}`, { pay: [payRes.status, payRes.body.message], t });
    const cancelled = summary.cancelled.includes(number);
    assert.notEqual(cancelled, payRes.status === 200, 'tepat satu hasil');
    assert.equal(cancelled, order === 'job');
    if (cancelled) {
      fx.assertAutoCancelledOnce(t, BR07_REASON, 'P2');
      assert.equal(payRes.status, 409);
    } else {
      assert.ok(summary.skipped.includes(number));
      assert.deepEqual([t.status, t.payment, t.paymentRow, t.cancelHistories], ['siap_diambil', 'paid', 'paid', 0]);
      assert.deepEqual(await fx.benefits(customer), before);
    }
    assert.equal((await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, 0);
  });

  test(`P3 BR-07 × ubah status admin (Dikonfirmasi → Sedang Disiapkan), ${order} antre lebih dulu`, async () => {
    const number = await payAtStoreOrder(await fx.customerWithBenefits());
    const jobRun = () => runAt(wib(D(), '20:00:01'));
    const advance = () => changeStatus(number, 'dikonfirmasi', 'sedang_disiapkan');
    const [x, y] = await queueOnOrder(number, order === 'job' ? jobRun : advance, order === 'job' ? advance : jobRun);
    const [summary, res] = order === 'job' ? [x, y] : [y, x];
    const t = await fx.trail(number);
    record(FILE, `P3-${order}`, { res: [res.status, res.body.message], t });
    if (order === 'job') {
      assert.equal(res.status, 409, 'status basi/final setelah dibatalkan');
      assert.ok(summary.cancelled.includes(number));
    } else {
      assert.equal(res.status, 200);
      assert.ok(summary.cancelled.includes(number), 'Sedang Disiapkan masih belum diambil (D1) → tetap dibatalkan');
    }
    fx.assertAutoCancelledOnce(t, BR07_REASON, 'P3');
  });

  test(`P4 BR-07 × batal pelanggan (Dikonfirmasi), ${order === 'job' ? 'job' : 'pelanggan'} antre lebih dulu → satu pembatalan`, async () => {
    const customer = await fx.customerWithBenefits();
    const number = await payAtStoreOrder(customer, { benefits: true });
    const before = await fx.benefits(customer);
    const jobRun = () => runAt(wib(D(), '20:00:01'));
    const cancel = () => call(server, 'PATCH', `/api/orders/${number}/cancel`, { userId: customer, body: { reason: 'Uji P4' } });
    const [x, y] = await queueOnOrder(number, order === 'job' ? jobRun : cancel, order === 'job' ? cancel : jobRun);
    const [summary, res] = order === 'job' ? [x, y] : [y, x];
    const t = await fx.trail(number);
    record(FILE, `P4-${order}`, { res: [res.status, res.body.message], t });
    assert.equal(summary.cancelled.includes(number), order === 'job');
    assert.equal(res.status, order === 'job' ? 409 : 200);
    assert.deepEqual([t.cancelHistories, t.cancelNotices, t.refunds, t.paymentRow], [1, 1, 1, order === 'job' ? 'expired' : 'failed']);
    assert.deepEqual(await fx.benefits(customer), { sold: before.sold - 2, quota: before.quota + 1, balance: 300, claimUsed: false });
  });
}

// ── P5 / P6 / Q2b ────────────────────────────────────────────────────────────────────────────────

test('P5 dua PROSES job: antre kunci yang sama → 1 batal + 1 lewati; 10 pesanan bersamaan → masing-masing tepat sekali', async () => {
  const now = wib(D(), '20:00:01');
  const customer = await fx.customerWithBenefits();
  const number = await payAtStoreOrder(customer, { benefits: true });
  const hold = fx.holdOrder(number);
  await hold.ready;
  const procs = [fx.runJobProcess(now), fx.runJobProcess(now)];
  await waitForAppLockWaits(2, { timeoutMs: 15000 });
  await hold.release();
  const results = await Promise.all(procs);
  assert.deepEqual([results.filter((r) => r.cancelled.includes(number)).length, results.filter((r) => r.skipped.includes(number)).length], [1, 1]);
  fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, 'P5a');

  const numbers = [];
  const customers = [];
  for (let i = 0; i < 5; i += 1) {
    const c = await fx.customerWithBenefits();
    customers.push(c);
    numbers.push(await payAtStoreOrder(c, { benefits: true }), await payAtStoreOrder(c, { status: 'siap_diambil' }));
  }
  const sold = await fx.stockSold();
  const quotaBefore = await fx.quota();
  const metricsBefore = await innodbMetrics();
  const both = await Promise.all([fx.runJobProcess(now), fx.runJobProcess(now)]);
  const cancelledAll = both.flatMap((r) => r.cancelled).filter((n) => numbers.includes(n));
  record(FILE, 'P5b', { both: both.map((r) => ({ c: r.cancelled.length, s: r.skipped.length, f: r.failed })) });
  assert.equal(cancelledAll.length, numbers.length);
  assert.equal(new Set(cancelledAll).size, numbers.length);
  for (const n of numbers) fx.assertAutoCancelledOnce(await fx.trail(n), BR07_REASON, `P5b ${n}`);
  assert.equal(await fx.stockSold(), sold - 2 * numbers.length);
  assert.equal(await fx.quota(), quotaBefore + customers.length);
  for (const c of customers) assert.equal(await fx.balance(c), 300);
  assert.equal((await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, 0);
});

test('P6 BR-07 × checkout pelanggan yang SAMA (F-C1-1): job menunggu users tanpa kunci payments/jam → 0 deadlock', async () => {
  for (let round = 0; round < 3; round += 1) {
    const customer = await fx.customerWithBenefits();
    const number = await payAtStoreOrder(customer, { benefits: true });
    const metricsBefore = await innodbMetrics();
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    await checkoutTx.ready;
    const jobRun = runAt(wib(D(), '20:00:01'));
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
    const conn = String(waits.find((w) => w.waiting_table === 'users').waiting_conn);
    const held = (await appHeldLocks()).filter((l) => String(l.conn) === conn).map((l) => `${l.table_name}:${l.lock_mode}`);
    const checkout = await checkoutTx.release(async (tx) => {
      await tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE');
      await tx.$executeRawUnsafe(`INSERT INTO orders (order_number, user_id, fulfillment_type, ready_date, time_slot, subtotal,
        shipping_fee, voucher_discount, points_used, points_discount, total, payment_option, payment_status, order_status, created_at)
        VALUES (?, ?, 'pickup', CURDATE(), '09.00–11.00', 10000, 0, 0, 0, 0, 10000, 'online', 'unpaid', 'menunggu_pembayaran', NOW())`,
      `P6-${Date.now().toString(36)}${round}`.slice(0, 20), customer);
      const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      await tx.$executeRawUnsafe("INSERT INTO payments (order_id, method_code, amount, status, expired_at) VALUES (?, 'qris', 10000, 'pending', NOW() + INTERVAL 30 MINUTE)", id);
    }).then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-120)}`);
    const summary = await jobRun;
    await sleep(100);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    record(FILE, 'P6', { round, held, checkout, deadlocks });
    assert.ok(held.some((l) => l.startsWith('orders:X')), held.join(' '));
    assert.ok(!held.some((l) => l.startsWith('payments:') || l.startsWith('operating_hours:')), `belum memegang payments/jam: ${held.join(' ')}`);
    assert.equal(checkout, 'commit');
    assert.ok(summary.cancelled.includes(number));
    assert.equal(deadlocks, 0);
    fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, `P6 ${round}`);
  }
});

test('Q2b F-C3-1: job BR-07 (pesanan terbaru) × checkout pelanggan LAIN produk yang sama → tanpa deadlock, data konsisten', async () => {
  const r = await cancelVsOtherCustomerCheckout('Q2b', async (number) => {
    await fx.makePayAtStore(number, { status: 'dikonfirmasi', readyDate: D() });
    return runAt(wib(D(), '20:00:01'));
  });
  assert.ok(!r.held.some((l) => l.startsWith('payments:payments_order_id_fkey')), r.held.join(' | '));
  assert.equal(r.checkoutResult, 'commit');
  assert.deepEqual(r.cancelResult.failed, []);
  assert.equal(r.deadlocks, 0);
  fx.assertAutoCancelledOnce(r.t, BR07_REASON, 'Q2b');
  assert.deepEqual(r.after, { sold: r.before.sold - 2 + 1, quota: r.before.quota + 1, balance: 300, claimUsed: false });
});

// ── P7 ───────────────────────────────────────────────────────────────────────────────────────────

test('P7 rollback BR-07: trigger menolak notifikasi poin satu pesanan → pesanan itu utuh, pesanan lain dibatalkan, lalu pulih', async () => {
  const customer = await fx.customerWithBenefits();
  const failing = await payAtStoreOrder(customer, { benefits: true });
  const other = await payAtStoreOrder(await fx.customerWithBenefits());
  const failingId = await fx.orderIdOf(failing);
  const before = { t: await fx.trail(failing), b: await fx.benefits(customer) };
  fx.mysqlCli(`DELIMITER //
    CREATE TRIGGER c3_fail_notification BEFORE INSERT ON notifications FOR EACH ROW
    BEGIN IF NEW.order_id = ${Number(failingId)} AND NEW.type = 'points' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'uji rollback C3'; END IF; END//
    DELIMITER ;`);
  let summary;
  try {
    summary = await runAt(wib(D(), '20:00:01'));
  } finally {
    fx.mysqlCli('DROP TRIGGER IF EXISTS c3_fail_notification;');
  }
  const failed = summary.failed.filter((f) => f.order_number === failing);
  record(FILE, 'P7', { failed });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].rule, 'BR-07');
  assert.match(failed[0].error, /uji rollback C3/);
  assert.ok(summary.cancelled.includes(other));
  assert.deepEqual(await fx.trail(failing), before.t, 'tanpa data parsial');
  assert.deepEqual(await fx.benefits(customer), { ...before.b, sold: (await fx.stockSold()) });
  assert.equal(await fx.balance(customer), before.b.balance);
  assert.equal(await fx.claimUsed(customer), true);
  assert.ok((await runAt(wib(D(), '20:00:02'))).cancelled.includes(failing));
  fx.assertAutoCancelledOnce(await fx.trail(failing), BR07_REASON, 'P7 ulang');
  assert.equal(await fx.balance(customer), 300);
});

// ── P8 ───────────────────────────────────────────────────────────────────────────────────────────

test(`P8 beban × ${ROUNDS_P8}: 2 pelari job (BR-06 + BR-07) + tandai lunas + ubah status + batal + checkout bersamaan → konsisten`, async () => {
  const metricsBefore = await innodbMetrics();
  const statuses = {};
  const violations = [];
  const bump = (k) => { statuses[k] = (statuses[k] ?? 0) + 1; };
  const now = wib(D(), '20:00:01');
  for (let round = 0; round < ROUNDS_P8; round += 1) {
    const customer = await fx.customerWithBenefits();
    const toPay = await payAtStoreOrder(customer, { status: 'siap_diambil', benefits: true });
    const toCancel = await payAtStoreOrder(customer);
    const toAdvance = await payAtStoreOrder(customer);
    const online = await fx.placeOrder(customer);
    await fx.setExpiry(online, -60000);
    const body = await fx.orderBody(customer);
    const [jobA, jobB, pay, cancel, advance, checkout] = await Promise.all([
      runAt(now),
      sleep(round % 3).then(() => runAt(now)),
      markPaid(toPay),
      call(server, 'PATCH', `/api/orders/${toCancel}/cancel`, { userId: customer, body: { reason: 'Uji P8' } }),
      changeStatus(toAdvance, 'dikonfirmasi', 'sedang_disiapkan'),
      call(server, 'POST', '/api/orders', { userId: customer, body }),
    ]);
    for (const [k, r] of [['pay', pay], ['cancel', cancel], ['advance', advance], ['checkout', checkout]]) bump(`${k} ${r.status}`);
    const failed = [...jobA.failed, ...jobB.failed];
    if (failed.length) violations.push({ round, failed });
    for (const n of [toPay, toCancel, toAdvance, online]) {
      const t = await fx.trail(n);
      if ([jobA, jobB].filter((r) => r.cancelled.includes(n)).length > 1) violations.push({ round, n, doubleJob: true });
      if (t.status === 'dibatalkan' && (t.cancelHistories !== 1 || t.cancelNotices !== 1 || t.refunds !== (t.pointsUsed > 0 ? 1 : 0))) violations.push({ round, n, t });
      if (t.histories !== t.statusNotices) violations.push({ round, n, mismatch: t });
    }
    const payT = await fx.trail(toPay);
    if ((pay.status === 200) === (payT.status === 'dibatalkan')) violations.push({ round, payXor: [pay.status, payT.status] });
    if ((await fx.trail(toAdvance)).status !== 'dibatalkan') violations.push({ round, advanceNotCancelled: true });
    if (payT.status === 'dibatalkan' && ((await fx.balance(customer)) !== 300 || (await fx.claimUsed(customer)))) violations.push({ round, benefits: true });
  }
  const [{ n: live }] = await rows(`SELECT COALESCE(SUM(i.quantity), 0) AS n FROM order_items i JOIN orders o ON o.order_id = i.order_id
    WHERE i.product_id = ? AND o.order_status <> 'dibatalkan'`, fx.state.readyProduct);
  const sold = await fx.stockSold();
  // Peniru checkout Q1/Q2 menambah qty_sold produk uji tanpa item pesanan — dihitung helper saat commit
  if (Number(live) + fx.state.harnessStock !== sold) violations.push({ stock: { live: Number(live), harnessStock: fx.state.harnessStock, sold } });
  await sleep(200);
  const summary = { statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks() };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'P8', summary);
  assert.ok(Object.keys(statuses).every((k) => / (200|201|409)$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(violations, []);
  assert.equal(summary.deadlocks, 0);
  assert.deepEqual(summary.leftover, []);
});

// ── H4: jam operasional TERBARU ──────────────────────────────────────────────────────────────────

/** Jalankan fn dengan jam hari D = 20.00 (buka), lalu pulihkan seluruh operating_hours */
async function withHours(fn) {
  const saved = await saveHours();
  try {
    await setCloseSql(DW(), '20:00:00');
    await runAt(wib(D(), '22:00:01')); // bersihkan kandidat lama hari D
    return await fn();
  } finally {
    await restoreHours(saved);
  }
}
const heldBy = async (conn) => (await appHeldLocks()).filter((l) => String(l.conn) === String(conn)).map((l) => `${l.table_name}:${l.lock_mode}`);
const unchanged = (t) => [t.status, t.paymentRow, t.cancelHistories, t.refunds];

test('H4-a jam DIPERPANJANG (AD-11 asli) antara query kandidat & transaksi → job MELEWATI pesanan; batal setelah jam tutup baru', async () => {
  await withHours(async () => {
    const customer = await fx.customerWithBenefits();
    const number = await payAtStoreOrder(customer, { benefits: true });
    const before = { t: await fx.trail(number), b: await fx.benefits(customer) };
    const hold = fx.holdOrder(number);
    await hold.ready;
    const jobRun = runAt(wib(D(), '20:05:00')); // snapshot 20.00 → kandidat, lalu menunggu kunci pesanan
    await waitForAppLockWaits(1);
    const put = await putHours(DW(), { close: '22:00' });
    await hold.release();
    const summary = await jobRun;
    record(FILE, 'H4-a', { put: put.status, summary: { c: summary.cancelled.includes(number), s: summary.skipped.includes(number) } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.ok(summary.skipped.includes(number) && !summary.cancelled.includes(number), 'keputusan memakai 22.00, bukan snapshot 20.00');
    assert.deepEqual(await fx.trail(number), before.t, 'tanpa riwayat/notifikasi/refund');
    assert.deepEqual(await fx.benefits(customer), before.b);
    assert.ok(!(await runAt(wib(D(), '22:00:00'))).cancelled.includes(number));
    assert.ok((await runAt(wib(D(), '22:00:01'))).cancelled.includes(number));
    fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, 'H4-a');
  });
});

/** Transaksi peniru AD-11 (urutan kunci saveOperatingHours): store_settings X → tulis baris jam hari D, belum commit */
function holdAd11Write(write) {
  return holdTransaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE');
    await write(tx);
  });
}

for (const [label, outcome, missingRow] of [
  ['H4-b', 'commit', false], ['H4-c', 'rollback', false], ['H4-b2 (baris jam tidak ada, AD-11 INSERT)', 'commit', true],
]) {
  test(`${label}: AD-11 belum commit saat job memutuskan → job menunggu kunci jam, lalu ${outcome === 'commit' ? 'membaca 22.00 & MELEWATI' : 'membaca 20.00 & MEMBATALKAN'}`, async () => {
    await withHours(async () => {
      if (missingRow) await db.$executeRawUnsafe('DELETE FROM operating_hours WHERE day_of_week = ?', DW()); // default 20.00
      const number = await payAtStoreOrder(await fx.customerWithBenefits());
      const ad11 = holdAd11Write((tx) => (missingRow
        ? tx.$executeRawUnsafe("INSERT INTO operating_hours (hour_id, day_of_week, open_time, close_time, is_open) VALUES (?, ?, '07:00:00', '22:00:00', 1)", DW(), DW())
        : tx.$executeRawUnsafe("UPDATE operating_hours SET close_time = '22:00:00' WHERE day_of_week = ?", DW())));
      await ad11.ready;
      const jobRun = runAt(wib(D(), '20:05:00'));
      const waits = await waitForAppLockWait((w) => w.waiting_table === 'operating_hours');
      const held = await heldBy(waits.find((w) => w.waiting_table === 'operating_hours').waiting_conn);
      if (outcome === 'commit') await ad11.release();
      else await ad11.release(() => { throw new Error('rollback AD-11'); }).catch(() => {});
      const summary = await jobRun;
      record(FILE, label, { held, waiting: waits.filter((w) => w.waiting_table === 'operating_hours').map((w) => w.waiting_mode), summary: { c: summary.cancelled.includes(number), s: summary.skipped.includes(number) } });
      assert.ok(held.some((l) => l.startsWith('orders:X')) && held.some((l) => l.startsWith('users:S')), `orders X & users S sebelum jam: ${held}`);
      if (outcome === 'commit') {
        assert.ok(summary.skipped.includes(number), 'jam tutup baru 22.00 belum lewat');
        assert.deepEqual(unchanged(await fx.trail(number)), ['dikonfirmasi', 'pending', 0, 0]);
      } else {
        assert.ok(summary.cancelled.includes(number), 'AD-11 di-rollback → jam tetap 20.00');
        fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, label);
      }
    });
  });
}

for (const [label, missingRow] of [['H4-d', false], ['H4-d2 (baris jam tidak ada)', true]]) {
  test(`${label}: job LEBIH DULU memegang kunci jam → AD-11 asli menunggu; job commit dengan jam yang sah saat keputusan, lalu AD-11 200`, async () => {
    await withHours(async () => {
      if (missingRow) await db.$executeRawUnsafe('DELETE FROM operating_hours WHERE day_of_week = ?', DW());
      const number = await payAtStoreOrder(await fx.customerWithBenefits());
      const metricsBefore = await innodbMetrics();
      // Tahan job SETELAH keputusan (langkah stok) agar kunci jam S tetap dipegang selagi AD-11 datang
      const stockHold = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT qty_sold FROM daily_stocks WHERE product_id = ? AND stock_date = ? FOR UPDATE', fx.state.readyProduct, fx.today()));
      await stockHold.ready;
      const jobRun = runAt(wib(D(), '20:05:00'));
      const jobWait = await waitForAppLockWait((w) => w.waiting_table === 'daily_stocks');
      const jobConn = jobWait.find((w) => w.waiting_table === 'daily_stocks').waiting_conn;
      const held = await heldBy(jobConn);
      const put = putHours(DW(), { close: '22:00' });
      const adWait = await waitForAppLockWait((w) => w.waiting_table === 'operating_hours');
      await stockHold.release();
      const [summary, putRes] = await Promise.all([jobRun, put]);
      await sleep(100);
      const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
      record(FILE, label, { held, adWait: adWait.filter((w) => w.waiting_table === 'operating_hours').map((w) => `${w.waiting_mode}<-${w.blocking_mode}`), put: putRes.status, deadlocks });
      assert.ok(held.some((l) => l.startsWith('operating_hours:S')), `job memegang kunci jam: ${held}`);
      assert.ok(summary.cancelled.includes(number), 'keputusan dengan jam yang berlaku saat itu (20.00) — AD-11 belum commit');
      assert.equal(putRes.status, 200, JSON.stringify(putRes.body));
      assert.equal(deadlocks, 0);
      fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, label);
      const [row] = await rows("SELECT TIME_FORMAT(close_time, '%H:%i') AS c FROM operating_hours WHERE day_of_week = ?", DW());
      assert.equal(row.c, '22:00', 'perubahan AD-11 tersimpan setelah job');
    });
  });
}

test('H4-e jam DIMAJUKAN (22.00 → 20.00): snapshot lama bukan kandidat (tidak terlalu awal); setelah AD-11, batal tepat setelah 20.00', async () => {
  await withHours(async () => {
    await setCloseSql(DW(), '22:00:00');
    const number = await payAtStoreOrder(await fx.customerWithBenefits());
    assert.ok(!(await runAt(wib(D(), '20:05:00'))).cancelled.includes(number));
    assert.equal((await putHours(DW(), { close: '20:00' })).status, 200);
    assert.ok(!(await runAt(wib(D(), '19:55:00'))).cancelled.includes(number), 'sebelum jam tutup baru');
    assert.ok((await runAt(wib(D(), '20:00:01'))).cancelled.includes(number));
    fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, 'H4-e');

    // Snapshot 20.00 (kandidat) lalu dimajukan ke 19.00 selagi job menunggu kunci pesanan → tetap lewat → dibatalkan
    const second = await payAtStoreOrder(await fx.customerWithBenefits());
    const hold = fx.holdOrder(second);
    await hold.ready;
    const jobRun = runAt(wib(D(), '20:05:00'));
    await waitForAppLockWaits(1);
    assert.equal((await putHours(DW(), { close: '19:00' })).status, 200);
    await hold.release();
    assert.ok((await jobRun).cancelled.includes(second));
  });
});

test('H4-f hari D DITUTUP lewat AD-11 setelah pesanan dibuat → fallback 00.00 WIB hari berikutnya (eksklusif)', async () => {
  await withHours(async () => {
    const number = await payAtStoreOrder(await fx.customerWithBenefits());
    const put = await putHours(DW(), { isOpen: false, close: null });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.ok(!(await runAt(wib(D(), '20:05:00'))).cancelled.includes(number));
    assert.ok(!(await runAt(wib(D(), '23:59:59', 999))).cancelled.includes(number));
    assert.ok((await runAt(wib(addDaysToDateKey(D(), 1), '00:00:00'))).cancelled.includes(number));
    fx.assertAutoCancelledOnce(await fx.trail(number), BR07_REASON, 'H4-f');
  });
});

test('H4-g siklus tiga pihak: job × checkout pelanggan yang sama × AD-11 → tanpa deadlock, job membaca jam terbaru', async () => {
  await withHours(async () => {
    const customer = await fx.customerWithBenefits();
    const number = await payAtStoreOrder(customer);
    const metricsBefore = await innodbMetrics();
    const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
    const ad11 = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'));
    await checkoutTx.ready;
    await ad11.ready;
    const jobRun = runAt(wib(D(), '20:05:00'));
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer));
    const held = await heldBy(waits.find((w) => w.waiting_table === 'users').waiting_conn);
    // checkout lanjut ke store_settings (menunggu AD-11); AD-11 lanjut menulis jam hari D (22.00)
    const checkoutDone = checkoutTx.release((tx) => tx.$queryRawUnsafe('SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE'))
      .then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-100)}`);
    await sleep(300);
    const ad11Done = ad11.release((tx) => tx.$executeRawUnsafe("UPDATE operating_hours SET close_time = '22:00:00' WHERE day_of_week = ?", DW()))
      .then(() => 'commit', (e) => `ERR ${String(e.meta?.message ?? e.message).slice(-100)}`);
    const [c, a, summary] = await Promise.all([checkoutDone, ad11Done, jobRun]);
    await sleep(100);
    const deadlocks = (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks;
    const result = { held, checkout: c, ad11: a, job: { c: summary.cancelled.includes(number), s: summary.skipped.includes(number), f: summary.failed }, deadlocks };
    if (deadlocks) result.latestDeadlock = await latestDeadlockSection();
    record(FILE, 'H4-g', result);
    assert.ok(!held.some((l) => l.startsWith('operating_hours:')), `job belum memegang kunci jam saat menunggu users: ${held}`);
    assert.deepEqual([c, a], ['commit', 'commit']);
    assert.equal(deadlocks, 0);
    assert.ok(summary.skipped.includes(number), 'jam terbaru 22.00 → belum lewat');
  });
});

test(`H4-h beban × ${ROUNDS_H4H}: job + AD-11 bolak-balik 20.00/22.00 + checkout + batal + tandai lunas → tanpa 5xx, 0 deadlock, konsisten`, async () => {
  await withHours(async () => {
    const metricsBefore = await innodbMetrics();
    const statuses = {};
    const violations = [];
    const bump = (k) => { statuses[k] = (statuses[k] ?? 0) + 1; };
    for (let round = 0; round < ROUNDS_H4H; round += 1) {
      const customer = await fx.customerWithBenefits();
      const plain = await payAtStoreOrder(customer, { benefits: true });
      const toPay = await payAtStoreOrder(customer, { status: 'siap_diambil' });
      const toCancel = await payAtStoreOrder(customer);
      const body = await fx.orderBody(customer);
      const close = round % 2 ? '20:00' : '22:00';
      const [jobA, put, pay, cancel, checkout, jobB] = await Promise.all([
        runAt(wib(D(), '21:00:00')),
        sleep(round % 4).then(() => putHours(DW(), { close })),
        markPaid(toPay),
        call(server, 'PATCH', `/api/orders/${toCancel}/cancel`, { userId: customer, body: { reason: 'Uji H4-h' } }),
        call(server, 'POST', '/api/orders', { userId: customer, body }),
        sleep(2).then(() => runAt(wib(D(), '21:00:00'))),
      ]);
      for (const [k, r] of [['put', put], ['pay', pay], ['cancel', cancel], ['checkout', checkout]]) bump(`${k} ${r.status}`);
      const failed = [...jobA.failed, ...jobB.failed];
      if (failed.length) violations.push({ round, failed });
      for (const n of [plain, toPay, toCancel]) {
        const t = await fx.trail(n);
        if ([jobA, jobB].filter((r) => r.cancelled.includes(n)).length > 1) violations.push({ round, n, doubleJob: true });
        if (t.status === 'dibatalkan' && (t.cancelHistories !== 1 || t.cancelNotices !== 1 || t.refunds !== (t.pointsUsed > 0 ? 1 : 0))) violations.push({ round, n, t });
        if (t.histories !== t.statusNotices) violations.push({ round, n, mismatch: t });
      }
      const payT = await fx.trail(toPay);
      if ((pay.status === 200) === (payT.status === 'dibatalkan')) violations.push({ round, payXor: [pay.status, payT.status] });
      // Setelah putaran: jam terakhir `close`; putaran job tambahan pada 21.00 harus konsisten dengan jam itu
      const after = await runAt(wib(D(), '21:00:00'));
      const plainT = await fx.trail(plain);
      if (close === '20:00' && plainT.status !== 'dibatalkan') violations.push({ round, shouldCancel: plain });
      if (close === '22:00' && plainT.status === 'dibatalkan' && after.cancelled.includes(plain)) violations.push({ round, earlyAfter22: plain });
    }
    await sleep(200);
    const summary = { statuses, violations, deadlocks: (await innodbMetrics()).lock_deadlocks - metricsBefore.lock_deadlocks, leftover: await appHeldLocks(), waits: await appLockWaits() };
    if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
    record(FILE, 'H4-h', summary);
    assert.ok(Object.keys(statuses).every((k) => / (200|201|409)$/.test(k)), JSON.stringify(statuses));
    assert.deepEqual(violations, []);
    assert.equal(summary.deadlocks, 0);
    assert.deepEqual(summary.leftover, []);
  });
});

// ── P9 ───────────────────────────────────────────────────────────────────────────────────────────

test('P9 SIGTERM saat transaksi BR-07 memegang kunci pesanan → commit utuh, kandidat BR-07 berikutnya tidak diproses, exit 0', async () => {
  await runAt(new Date()); // bersihkan kandidat BR-06/BR-07 yang jatuh tempo menurut jam nyata
  const yesterday = addDaysToDateKey(fx.today(), -1); // tanggal siap kemarin → pasti lewat jam tutup
  const customer = await fx.customerWithBenefits();
  const numbers = [
    await payAtStoreOrder(customer, { benefits: true, readyDate: yesterday }),
    await payAtStoreOrder(await fx.customerWithBenefits(), { readyDate: yesterday }),
    await payAtStoreOrder(await fx.customerWithBenefits(), { readyDate: yesterday }),
  ];
  const before = await Promise.all(numbers.map(fx.trail));
  const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
  await checkoutTx.ready;
  const srv = fx.startSchedulerServer('p9');
  try {
    const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(customer), { timeoutMs: 15000 });
    const conn = waits.find((w) => w.waiting_table === 'users').waiting_conn;
    const heldBefore = await heldBy(conn);
    srv.child.kill('SIGTERM');
    await sleep(400);
    const alive = srv.child.exitCode === null;
    await checkoutTx.release();
    const exit = await srv.exited;
    const after = await Promise.all(numbers.map(fx.trail));
    const text = srv.readLog();
    record(FILE, 'P9', { heldBefore, alive, exit, log: text.split('\n').filter((l) => /Job|SIGTERM/.test(l)) });
    assert.ok(heldBefore.some((l) => l.startsWith('orders:X')), heldBefore.join(' '));
    assert.equal(alive, true, 'proses menunggu transaksi job');
    assert.deepEqual(exit, { code: 0, signal: null });
    fx.assertAutoCancelledOnce(after[0], BR07_REASON, 'P9 pesanan yang sedang diproses');
    assert.deepEqual(after.slice(1), before.slice(1), 'kandidat berikutnya tidak disentuh');
    assert.match(text, /Shutdown diminta — 2 kandidat tersisa tidak diproses\./);
    assert.ok(text.indexOf('SIGTERM diterima') < text.indexOf('Shutdown diminta'));
  } finally {
    if (srv.child.exitCode === null) srv.child.kill('SIGKILL');
  }
});
