// tests-mysql/04-staff-deadlock.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · C3c PATCH vs checkout (FR-12 · C-14) & AD-04 (FR-28)
// Urutan kunci aplikasi:
//   checkout  : users(pelanggan) X → store_settings X → … → INSERT riwayat (FK users pelanggan, sudah X)
//   AD-11     : users(target admin) X → store_settings X → UPDATE users(target) (perbaikan F-1; sebelumnya
//               store_settings X → UPDATE users(target) X — membentuk siklus dengan checkout & AD-04 Selesai)
//   AD-04     : orders X → INSERT order_status_histories (FK changed_by → users(admin) S)
//               → bila Selesai: INSERT point_transactions (FK user_id → users(pelanggan) S)
// D1 deterministik: AD-04 (riwayat) memegang kunci S baris admin → PATCH menunggu di baris target TANPA memegang
//    store_settings → checkout lain tidak ikut tertahan.
// D2 deterministik: tiga request ASLI (PATCH, checkout, AD-04 Selesai) disusun pada urutan yang dulu membentuk siklus →
//    dibuktikan dengan metrik lock_deadlocks, log error MySQL (innodb_print_all_deadlocks), dan LATEST DETECTED DEADLOCK.
//    D2-kontrol: urutan sama tanpa langkah Selesai (tanpa kunci pelanggan).
//    Sejak Step 6.5 C5 (B2): AD-04 mengunci baris admin pelaku dengan FOR SHARE (lockAuditActor) tepat setelah orders X.
//    Di D2 PATCH menonaktifkan Staf yang sama dan commit lebih dulu → AD-04 Staf melihat akun nonaktif → 401
//    SESSION_INVALID tanpa perubahan (sebelum C5: 200 dengan changed_by admin yang sudah nonaktif). Tetap 0 deadlock.
// D3 beban campuran acak (checkout + AD-04 + PATCH Staf/Owner) — dihitung lewat metrik InnoDB, bukan status HTTP.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  db, rows, holdTransaction, waitForAppLockWaits, waitForAppLockWait, appLockWaits, appHeldLocks, appOpenTransactions, innodbMetrics,
  latestDeadlockSection, mysqlErrorLogSince, deadlockLinesIn, sleep, record,
} = require('./helpers/context');
const { startServer, patchActive } = require('./helpers/server');
const {
  ORDER_STATUS, createUser, onlyTheseOwnersActive, isActive, checkout, prepareOrder, nextStepBody, changeStatus, tally,
} = require('./helpers/fixtures');

const FILE = '04-staff-deadlock';
const ROUNDS = Number(process.env.C4_ROUNDS_DEADLOCK || 50);
let server;

test.before(async () => { server = await startServer(FILE); });
test.after(async () => { await server?.stop(); await db.$disconnect(); });

const LOCK_SQL = 'SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE';

/** Pesanan asli (checkout HTTP) milik pelanggan, disiapkan di status tertentu & lunas */
async function orderAt(customerId, status) {
  const res = await checkout(server, customerId);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = await prepareOrder(res.body.data.order_number, status);
  return { orderNumber: res.body.data.order_number, ...row };
}

async function waitForWaits(count) {
  await waitForAppLockWaits(count, { timeoutMs: 15000 });
  return appLockWaits();
}

test('D1 AD-04 memegang kunci S baris admin (FK changed_by) → PATCH menunggu di baris target tanpa memegang store_settings; checkout tidak tertahan', async () => {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  const customer = await createUser('customer');
  await onlyTheseOwnersActive([owner]);
  const order = await orderAt(customer, ORDER_STATUS.DIKONFIRMASI);
  const before = await innodbMetrics();

  // Meniru transaksi AD-04 changeOrderStatus sampai INSERT riwayat (pernyataan sama), lalu ditahan
  const ad04 = holdTransaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT order_id FROM orders WHERE order_number = ? FOR UPDATE', order.orderNumber);
    await tx.$executeRawUnsafe("UPDATE orders SET order_status = 'sedang_disiapkan' WHERE order_id = ?", order.order_id);
    await tx.$executeRawUnsafe("INSERT INTO order_status_histories (order_id, status, changed_by, changed_at) VALUES (?, 'sedang_disiapkan', ?, NOW())", order.order_id, staff);
  });
  await ad04.ready;
  const patch = patchActive(server, owner, staff, false);
  const [patchWait] = await waitForWaits(1);
  const patchLocks = (await appHeldLocks()).filter((l) => String(l.conn) === String(patchWait.waiting_conn) && l.lock_type === 'RECORD');
  const other = await createUser('customer');
  const coRes = await checkout(server, other); // selesai selagi PATCH masih menunggu
  const waitsAfterCheckout = await appLockWaits();
  await ad04.release();
  const patchRes = await patch;
  const after = await innodbMetrics();
  record(FILE, 'D1', { patchWait, patchLocks, waitsAfterCheckout, patch: patchRes.status, checkout: [coRes.status, coRes.ms], deadlocks: after.lock_deadlocks - before.lock_deadlocks });
  assert.equal(patchWait.waiting_table, 'users');
  assert.equal(patchWait.waiting_data, staff);
  assert.equal(patchWait.waiting_mode, 'X,REC_NOT_GAP');
  assert.equal(patchWait.blocking_mode, 'S,REC_NOT_GAP');
  assert.ok(!patchLocks.some((l) => l.table_name === 'store_settings'), 'PATCH yang menunggu belum memegang store_settings');
  assert.ok(waitsAfterCheckout.some((w) => w.waiting_data === staff), 'PATCH masih menunggu AD-04 saat checkout selesai');
  assert.equal(patchRes.status, 200);
  assert.equal(coRes.status, 201);
  assert.equal(after.lock_deadlocks, before.lock_deadlocks);
});

/**
 * Susun tiga request asli. withCompletion=true → AD-04 langkah Selesai (INSERT poin → kunci S baris pelanggan).
 * Urutan: H0 pegang store_settings → PATCH (kunci baris Staf) antre → checkout(pelanggan C) kunci C lalu antre → AD-04
 * (S baris Staf → antre di belakang PATCH) → lepas H0.
 */
async function threeWay(withCompletion) {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  const customer = await createUser('customer');
  await onlyTheseOwnersActive([owner]);
  const order = await orderAt(customer, withCompletion ? ORDER_STATUS.SIAP_DIAMBIL : ORDER_STATUS.DIKONFIRMASI);
  const before = await innodbMetrics();
  const since = new Date(Date.now() - 1000);

  const h0 = holdTransaction((tx) => tx.$queryRawUnsafe(LOCK_SQL));
  await h0.ready;
  const patch = patchActive(server, owner, staff, false);
  await waitForWaits(1);
  const co = checkout(server, customer);
  await waitForWaits(2);
  const ad04 = changeStatus(server, staff, order.orderNumber, nextStepBody(withCompletion ? ORDER_STATUS.SIAP_DIAMBIL : ORDER_STATUS.DIKONFIRMASI, order.pickup_code));
  // AD-04 harus benar-benar antre kunci S di tabel users: baris Staf (dikunci PATCH, F-1) atau baris pelanggan C
  const waitsBeforeRelease = await waitForAppLockWait((w) => w.waiting_table === 'users'
    && [staff, customer].includes(w.waiting_data) && /^S/.test(w.waiting_mode));
  await h0.release();
  const [patchRes, coRes, ad04Res] = await Promise.all([patch, co, ad04]);
  await sleep(300);
  const after = await innodbMetrics();
  const log = mysqlErrorLogSince(since);
  const result = {
    withCompletion,
    waitsBeforeRelease,
    statuses: { patch: patchRes.status, checkout: coRes.status, ad04: ad04Res.status },
    ad04Code: ad04Res.body.code,
    bodies: { patch: patchRes.body.message, checkout: coRes.body.message, ad04: ad04Res.body.message },
    ids: { owner, staff, customer, order: order.orderNumber },
    deadlocks: after.lock_deadlocks - before.lock_deadlocks,
    errorLogDeadlockLines: deadlockLinesIn(log),
    staffActive: await isActive(staff),
    orderStatus: (await rows('SELECT order_status FROM orders WHERE order_number = ?', order.orderNumber))[0].order_status,
    leftoverLocks: await appHeldLocks(),
    openTransactions: await appOpenTransactions(),
  };
  if (result.deadlocks > 0) result.latestDeadlock = await latestDeadlockSection();
  return { result, serverLog: server.readLog() };
}

test('D2-kontrol: PATCH + checkout + AD-04 (bukan Selesai) dengan urutan sama → tanpa deadlock', async () => {
  const { result } = await threeWay(false);
  record(FILE, 'D2-control', result);
  assert.equal(result.deadlocks, 0);
  // C5 B2: Staf sudah dinonaktifkan (PATCH commit) sebelum AD-04 memperoleh FOR SHARE baris Staf
  assert.deepEqual(result.statuses, { patch: 200, checkout: 201, ad04: 401 });
  assert.equal(result.ad04Code, 'SESSION_INVALID');
  assert.equal(result.orderStatus, ORDER_STATUS.DIKONFIRMASI, 'AD-04 ditolak tanpa perubahan');
});

test('D2a H0 memegang store_settings; PATCH, checkout C, dan AD-04 Selesai (pesanan C) antre bersamaan → tanpa deadlock', async () => {
  const { result, serverLog } = await threeWay(true);
  const deadlockLog = serverLog.split('\n').filter((l) => /Invalid `|deadlock|P2034|1213/i.test(l));
  record(FILE, 'D2a', { ...result, serverLogDeadlock: deadlockLog });
  assert.deepEqual(result.leftoverLocks, [], 'tidak ada kunci tertinggal');
  assert.equal(result.deadlocks, 0);
  // C5 B2: Staf sudah dinonaktifkan (PATCH commit) sebelum AD-04 memperoleh FOR SHARE baris Staf
  assert.deepEqual(result.statuses, { patch: 200, checkout: 201, ad04: 401 });
  assert.equal(result.ad04Code, 'SESSION_INVALID');
  assert.equal(result.orderStatus, ORDER_STATUS.SIAP_DIAMBIL, 'AD-04 ditolak tanpa perubahan');
});

// Urutan yang tercatat di dump deadlock D3: checkout sudah memegang baris pelanggan C, AD-04 Selesai (asli) antre di C
// sambil memegang S baris Staf, PATCH (asli) memegang store_settings dan antre di baris Staf, lalu checkout meminta
// store_settings. Langkah checkout ditiru dengan pernyataan lockRows yang PERSIS (orderCreate.service.js) karena
// request checkout asli tidak bisa dihentikan di antara dua kuncinya; korban checkout asli terlihat di D3.
test('D2b siklus deterministik checkout(lockRows) → AD-04 Selesai → PATCH → checkout: tanpa deadlock?', async () => {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  const customer = await createUser('customer');
  await onlyTheseOwnersActive([owner]);
  const order = await orderAt(customer, ORDER_STATUS.SIAP_DIAMBIL);
  const before = await innodbMetrics();
  const since = new Date(Date.now() - 1000);

  const checkoutTx = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', customer));
  await checkoutTx.ready;
  const ad04 = changeStatus(server, staff, order.orderNumber, nextStepBody(ORDER_STATUS.SIAP_DIAMBIL, order.pickup_code));
  await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === customer);
  const patch = patchActive(server, owner, staff, false);
  const waits = await waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === staff);
  const checkoutOutcome = await checkoutTx.release((tx) => tx.$queryRawUnsafe(LOCK_SQL))
    .then(() => 'commit', (error) => ({ code: error.code, message: String(error.message).split('\n').filter(Boolean).at(-1) }));
  const [ad04Res, patchRes] = await Promise.all([ad04, patch]);
  await sleep(300);
  const after = await innodbMetrics();
  const errorLog = mysqlErrorLogSince(since);
  const result = {
    waits,
    statuses: { ad04: ad04Res.status, patch: patchRes.status },
    checkoutOutcome,
    deadlocks: after.lock_deadlocks - before.lock_deadlocks,
    errorLogDeadlockLines: deadlockLinesIn(errorLog),
    latestDeadlock: await latestDeadlockSection(),
    leftoverLocks: await appHeldLocks(),
  };
  record(FILE, 'D2b', result);
  assert.deepEqual(result.leftoverLocks, []);
  assert.equal(result.deadlocks, 0, `TEMUAN: deadlock InnoDB nyata (korban: ${JSON.stringify(checkoutOutcome)})`);
});

test(`D3 beban campuran acak × ${ROUNDS}: checkout + AD-04 (termasuk Selesai) + PATCH Staf/Owner`, async () => {
  const before = await innodbMetrics();
  const since = new Date(Date.now() - 1000);
  const statuses = { checkout: {}, ad04: {}, patch: {} };
  const add = (kind, results) => Object.entries(tally(results)).forEach(([s, c]) => { statuses[kind][s] = (statuses[kind][s] ?? 0) + c; });
  for (let round = 0; round < ROUNDS; round += 1) {
    const ownerA = await createUser('owner');
    const ownerB = await createUser('owner');
    const staff = await createUser('staf');
    await onlyTheseOwnersActive([ownerA, ownerB]);
    const customers = [];
    for (let i = 0; i < 6; i += 1) customers.push(await createUser('customer'));
    const orders = [];
    for (const c of customers.slice(0, 4)) orders.push(await orderAt(c, round % 2 ? ORDER_STATUS.SIAP_DIAMBIL : ORDER_STATUS.SEDANG_DISIAPKAN));
    const jobs = [
      ...customers.map((c) => ['checkout', () => checkout(server, c)]),
      ...orders.map((o) => ['ad04', () => changeStatus(server, staff, o.orderNumber, nextStepBody(round % 2 ? ORDER_STATUS.SIAP_DIAMBIL : ORDER_STATUS.SEDANG_DISIAPKAN, o.pickup_code))]),
      ['patch', () => patchActive(server, ownerA, staff, false)],
      ['patch', () => patchActive(server, ownerB, staff, true)],
      ['patch', () => patchActive(server, ownerA, ownerB, false)],
      ['patch', () => patchActive(server, ownerB, ownerA, false)],
    ];
    const results = await Promise.all(jobs.map(([, run]) => run()));
    ['checkout', 'ad04', 'patch'].forEach((kind) => add(kind, results.filter((_, i) => jobs[i][0] === kind)));
    assert.ok((await rows("SELECT COUNT(*) AS n FROM users WHERE role='owner' AND is_active=1"))[0].n >= 1);
  }
  await sleep(300);
  const after = await innodbMetrics();
  const summary = {
    rounds: ROUNDS, statuses,
    deadlocks: after.lock_deadlocks - before.lock_deadlocks,
    lockTimeouts: after.lock_timeouts - before.lock_timeouts,
    rowLockWaits: after.lock_row_lock_waits - before.lock_row_lock_waits,
    errorLogDeadlockLines: deadlockLinesIn(mysqlErrorLogSince(since)).length,
    leftoverLocks: await appHeldLocks(),
  };
  record(FILE, 'D3', summary);
  assert.deepEqual(summary.leftoverLocks, []);
  assert.equal(summary.deadlocks, 0, `TEMUAN: ${summary.deadlocks} deadlock pada beban campuran — ${JSON.stringify(statuses)}`);
});
