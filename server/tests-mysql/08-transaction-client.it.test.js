// tests-mysql/08-transaction-client.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3) · implementasi final F-2 (opsi C) & perbaikan deadlock checkout × pembatalan.
// I1 isolasi dua pool (CONNECTION_ID) · I2 timeout/maxWait bawaan & opsi per panggilan · I3 pemulihan × 20: P2028 dengan
// pernyataan masih berjalan → probe mendeteksi → koneksi rusak dibuang → transaksi berikutnya benar di koneksi lain · I4 7 lock wait berhasil, 8 gagal bersih & pulih ·
// I5 HTTP: checkout P=10 semua kunci diperebutkan (P2028) → checkout berikutnya 201 tanpa panic · I6 checkout × pembatalan
// pelanggan yang sama (dulu deadlock 6/6) × 20 · I7 beban campuran checkout + pembatalan + AD-04 + AD-11 tanpa deadlock.
// I1–I4 memakai factory produksi (src/lib/prismaClients.js) langsung; I5–I7 lewat server API asli.

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createPrismaClients } = require('../src/lib/prismaClients');
const { READ_SNAPSHOT_OPTIONS } = require('../src/services/readSnapshot.service');
const { TIME_SLOTS } = require('../src/utils/businessConstants');
const { formatTimeSlot } = require('../src/services/operatingHours.service');
const { getJakartaDateKey } = require('../src/utils/jakartaDate');
const {
  APP_URL, db, rows, holdTransaction, waitForAppLockWait, appLockWaits, appHeldLocks, appOpenTransactions, innodbMetrics,
  latestDeadlockSection, sleep, record,
} = require('./helpers/context');
const { startServer, call, patchActive } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, unique, prepareOrder, nextStepBody, changeStatus, ORDER_STATUS, tally } = require('./helpers/fixtures');

const FILE = '08-transaction-client';
const ROUNDS = Number(process.env.C4_ROUNDS_CANCEL || 20);
const TODAY = getJakartaDateKey(new Date());
let clients;
let probeRetries = [];
let server;
let readyProducts = [];

const brief = (e) => ({ code: e?.code, name: e?.name, msg: String(e?.message ?? e).split('\n').filter(Boolean).at(-1).slice(0, 140) });
const isPanic = (e) => e?.name === 'PrismaClientRustPanicError' || /panic/i.test(String(e?.message));

test.before(async () => {
  clients = createPrismaClients({
    databaseUrl: APP_URL,
    PrismaClient,
    onProbeRetry: (e, attempt) => probeRetries.push({ code: e.code ?? e.name, attempt }),
  });
  // Produk ready khusus uji (stok besar hari ini, WIB) + voucher dengan masa berlaku panjang — hanya di database sementara
  for (let i = 0; i < 10; i += 1) {
    await db.$executeRawUnsafe(`INSERT INTO products (category_id, name, description, price, availability_type, lead_time_days, is_active)
      VALUES (3, ?, 'Produk uji integrasi', 10000, 'ready', 0, 1)`, unique('C4 Ready '));
  }
  readyProducts = (await rows("SELECT product_id AS id FROM products WHERE description = 'Produk uji integrasi' ORDER BY product_id")).map((r) => r.id);
  for (const p of readyProducts) {
    await db.$executeRawUnsafe('INSERT INTO daily_stocks (product_id, stock_date, qty_planned, qty_sold) VALUES (?, ?, 100000, 0)', p, TODAY);
  }
  server = await startServer(FILE);
});
test.after(async () => { await server?.stop(); await clients?.prisma.$disconnect(); await db.$disconnect(); });

/** Body checkout: produk ready (stok hari ini) + 1 pre-order (agar tanggal & slot selalu sah, jam berapa pun uji dijalankan) */
async function orderBody(userId, products) {
  const items = [...products.map((p) => ({ cart_item_id: unique('ci'), product_id: String(p), quantity: 1 })), { cart_item_id: unique('ci'), product_id: '9', quantity: 1 }];
  const cart = await call(server, 'POST', '/api/cart', { userId, body: { items } });
  assert.equal(cart.status, 200, JSON.stringify(cart.body));
  return { items, fulfillment: 'pickup', address_id: null, ready_date: cart.body.data.ready_date, time_slot: formatTimeSlot(TIME_SLOTS[1]), voucher_code: null, use_points: false, method_code: 'qris' };
}
const placeOrder = async (userId, products) => call(server, 'POST', '/api/orders', { userId, body: await orderBody(userId, products) });

/** Pemegang kunci (koneksi harness) dilepas `holdMs` setelah aplikasi mulai menunggunya; urut kedatangan */
function releaseOnWait(holders, holdMs) {
  let stop = false; const order = [];
  const loop = (async () => {
    while (!stop) {
      const waits = await appLockWaits();
      for (const h of holders) if (!h.released && waits.some(h.match)) { h.released = true; order.push(h.name); setTimeout(() => h.hold.release(), holdMs); }
      await sleep(10);
    }
  })();
  return { order, stop: async () => { stop = true; await loop; holders.filter((h) => !h.released).forEach((h) => h.hold.release()); } };
}
async function rowHolder(name, sql, params, match) {
  const h = holdTransaction((tx) => tx.$queryRawUnsafe(sql, ...params));
  await h.ready;
  return { name, hold: h, match, released: false };
}

test('I1 isolasi pool: query biasa ≤ 5 koneksi, transaksi ≤ 4 koneksi, CONNECTION_ID tidak pernah sama', async () => {
  const { prisma } = clients;
  const plainConn = () => prisma.$queryRawUnsafe('SELECT CONNECTION_ID() AS c, SLEEP(0.2) AS s').then((r) => String(r[0].c));
  const txConn = () => prisma.$transaction((tx) => tx.$queryRawUnsafe('SELECT CONNECTION_ID() AS c, SLEEP(0.2) AS s')).then((r) => String(r[0].c));
  const authConn = () => prisma.user.findUnique({ where: { userId: 3n }, select: { userId: true } }).then(() => prisma.$queryRawUnsafe('SELECT CONNECTION_ID() AS c')).then((r) => String(r[0].c));
  const [mains, txs, auths] = await Promise.all([Promise.all(Array.from({ length: 12 }, plainConn)), Promise.all(Array.from({ length: 12 }, txConn)), Promise.all(Array.from({ length: 6 }, authConn))]);
  const mainSet = new Set([...mains, ...auths]);
  const txSet = new Set(txs);
  record(FILE, 'I1', { main: [...mainSet], tx: [...txSet] });
  assert.ok(mainSet.size >= 2 && mainSet.size <= 5, `pool utama ${mainSet.size}`);
  assert.ok(txSet.size >= 2 && txSet.size <= 4, `pool transaksi ${txSet.size}`);
  assert.deepEqual([...txSet].filter((c) => mainSet.has(c)), [], 'tidak ada koneksi yang dipakai kedua pool');
});

test('I2 bawaan transaksi: timeout 15 s (bukan 5 s), maxWait 2 s; opsi per panggilan (runInReadSnapshot 10 s) tidak tertimpa', async () => {
  const { prisma } = clients;
  let t0 = Date.now();
  const longWork = await prisma.$transaction(async (tx) => { await tx.$queryRawUnsafe('SELECT 1'); await sleep(6000); return tx.$queryRawUnsafe('SELECT 1'); })
    .then(() => 'commit', brief);
  const longWorkMs = Date.now() - t0;

  t0 = Date.now();
  const snapshot = await prisma.$transaction(async (tx) => { await tx.$queryRawUnsafe('SELECT 1'); await sleep(11000); return tx.$queryRawUnsafe('SELECT 1'); }, READ_SNAPSHOT_OPTIONS)
    .then(() => 'commit', brief);
  const snapshotMs = Date.now() - t0;

  let release;
  const gate = new Promise((r) => { release = r; });
  const busy = Array.from({ length: 4 }, () => prisma.$transaction(async (tx) => { await tx.$queryRawUnsafe('SELECT 1'); await gate; }));
  await sleep(300);
  t0 = Date.now();
  const fifth = await prisma.$transaction((tx) => tx.$queryRawUnsafe('SELECT 1')).then(() => 'commit', brief);
  const fifthMs = Date.now() - t0;
  const plainWhileFull = await prisma.$queryRawUnsafe('SELECT 1 AS ok').then(() => 'ok', brief);
  release();
  await Promise.all(busy);
  record(FILE, 'I2', { longWork, longWorkMs, snapshot, snapshotMs, fifth, fifthMs, plainWhileFull });
  assert.equal(longWork, 'commit', 'transaksi 6 s berhasil (timeout bawaan kini 15 s)');
  assert.equal(snapshot.code, 'P2028', 'opsi eksplisit 10 s runInReadSnapshot tetap berlaku');
  assert.ok(snapshotMs >= 10900 && snapshotMs < 12500, `snapshot ms=${snapshotMs}`);
  assert.equal(fifth.code, 'P2028');
  assert.match(fifth.msg, /Unable to start a transaction/);
  assert.ok(fifthMs >= 1900 && fifthMs < 3000, `maxWait ms=${fifthMs}`);
  assert.equal(plainWhileFull, 'ok', 'query biasa tidak ikut menunggu pool transaksi yang penuh');
});

// Pemulihan: 20 putaran (10 pola SLEEP, 10 pola kunci selesai setelah timeout). Setiap putaran membuktikan: (1) P2028 saat
// pernyataan masih berjalan; (2) probe mendeteksi respons tidak sinkron; (3) koneksi rusak tidak lagi ada di PROCESSLIST;
// (4) retry memakai CONNECTION_ID lain; (5) 4 transaksi berikutnya membaca nilai yang benar; (6) tanpa P1017/P1001 yang
// merembet; (7) tanpa Rust panic; (8) koneksi sehat lain & transaksi yang sedang berjalan tidak terganggu; (9) callback
// tidak pernah dijalankan dua kali.
const appConnIds = async () => (await rows("SELECT ID AS id FROM information_schema.PROCESSLIST WHERE USER = 'c4app'")).map((r) => String(r.id));

test('I3 pemulihan × 20: P2028 dengan pernyataan masih berjalan → probe mendeteksi → koneksi rusak dibuang → 4 transaksi berikutnya benar di koneksi lain', async () => {
  const { prisma } = clients;
  const outcomes = [];
  for (let i = 0; i < 20; i += 1) {
    const pattern = i % 2 ? 'lock-after-timeout' : 'sleep';
    probeRetries = [];
    const staff = await createUser('staf');
    let victimConn = null;
    const victimBody = async (tx) => {
      victimConn = String((await tx.$queryRawUnsafe('SELECT CONNECTION_ID() AS c'))[0].c);
      if (pattern === 'sleep') return tx.$queryRawUnsafe('SELECT SLEEP(3)');
      return tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', staff);
    };
    let h = null;
    if (pattern !== 'sleep') {
      h = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', staff));
      await h.ready;
      setTimeout(() => h.release(), 1500); // pernyataan korban selesai 0,5 s setelah timeout 1 s
    }
    const victim = await prisma.$transaction(victimBody, { timeout: 1000 }).then(() => 'ok', brief);
    await sleep(700);
    const before = await appConnIds();

    // Transaksi sehat yang sedang berjalan di koneksi pool transaksi lain selama pemulihan (tidak boleh ikut terputus)
    let concurrentConn = null;
    const concurrent = prisma.$transaction(async (tx) => {
      concurrentConn = String((await tx.$queryRawUnsafe('SELECT CONNECTION_ID() AS c'))[0].c);
      await tx.$queryRawUnsafe('SELECT SLEEP(2.5)');
      return 'commit';
    }).then((v) => v, brief);
    await sleep(100);

    const auth = await prisma.user.findUnique({ where: { userId: BigInt(staff) }, select: { isActive: true } }).then((u) => (u?.isActive ? 'ok' : 'SALAH'), brief);
    const next = [];
    const callbackRuns = [];
    for (let k = 0; k < 4; k += 1) {
      const expected = 1000 + i * 10 + k;
      let runs = 0;
      next.push(await prisma.$transaction(async (tx) => {
        runs += 1;
        const [r] = await tx.$queryRawUnsafe(`SELECT ${expected} AS v, CONNECTION_ID() AS c`);
        const u = await tx.user.findUnique({ where: { userId: BigInt(staff) }, select: { userId: true } });
        return String(r.v) === String(expected) && u && String(u.userId) === staff ? `ok@${r.c}` : `SALAH ${JSON.stringify({ v: String(r.v), u: !!u })}`;
      }).then((v) => v, (e) => ({ ...brief(e), panic: isPanic(e) })));
      callbackRuns.push(runs);
    }
    const concurrentResult = await concurrent;
    const after = await appConnIds();
    outcomes.push({
      i, pattern, victim: victim.code ?? victim, victimConn, auth, next, callbackRuns, probeRetries: probeRetries.map((r) => r.code),
      concurrent: concurrentResult, concurrentConn, victimGone: !after.includes(victimConn),
      healthyKilled: before.filter((id) => id !== victimConn && !after.includes(id)),
    });
  }
  const summary = {
    rounds: outcomes.length,
    victimGone: outcomes.filter((o) => o.victimGone).length,
    recovered: outcomes.filter((o) => o.next.every((n) => typeof n === 'string' && n.startsWith('ok@'))).length,
    detectedBy: outcomes.reduce((acc, o) => { o.probeRetries.forEach((c) => { acc[c] = (acc[c] ?? 0) + 1; }); return acc; }, {}),
  };
  record(FILE, 'I3', { summary, outcomes, leftover: await appHeldLocks(), openTrx: await appOpenTransactions() });
  for (const o of outcomes) {
    const ctx = JSON.stringify(o);
    assert.equal(o.victim, 'P2028', `(1) P2028 saat pernyataan masih berjalan — ${ctx}`);
    assert.ok(o.probeRetries.length >= 1, `(2) probe mendeteksi koneksi rusak — ${ctx}`);
    assert.equal(o.victimGone, true, `(3) koneksi rusak tidak lagi ada di PROCESSLIST — ${ctx}`);
    assert.ok(o.next.every((n) => n !== `ok@${o.victimConn}`), `(4) retry memakai CONNECTION_ID lain — ${ctx}`);
    assert.ok(o.next.every((n) => typeof n === 'string' && n.startsWith('ok@')), `(5)(6)(7) 4 transaksi berikutnya benar, tanpa P1017/P1001/panic — ${ctx}`);
    assert.equal(o.auth, 'ok', `(8) auth lewat pool utama benar — ${ctx}`);
    assert.deepEqual(o.healthyKilled, [], `(8) koneksi sehat lain tidak terputus — ${ctx}`);
    assert.equal(o.concurrent, 'commit', `(8) transaksi sehat yang berjalan bersamaan tetap commit — ${ctx}`);
    assert.deepEqual(o.callbackRuns, [1, 1, 1, 1], `(9) callback tepat sekali — ${ctx}`);
  }
  assert.deepEqual(await appHeldLocks(), []);
});

test('I4 tujuh lock wait berturut-turut berhasil (< 15 s); delapan gagal P2028 dengan rollback bersih, transaksi berikutnya pulih', async () => {
  const { prisma } = clients;
  const result = {};
  for (const k of [7, 8]) {
    probeRetries = [];
    const ids = [];
    for (let i = 0; i < k; i += 1) ids.push(await createUser('staf'));
    const holders = [];
    for (const id of ids) holders.push(await rowHolder(`u${id}`, 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [id], (w) => w.waiting_table === 'users' && w.waiting_data === String(id)));
    const ctl = releaseOnWait(holders, 1940);
    const marker = unique('k');
    const started = Date.now();
    const outcome = await prisma.$transaction(async (tx) => {
      for (const id of ids) await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${BigInt(id)} FOR UPDATE`;
      await tx.$executeRaw`UPDATE users SET name = ${marker} WHERE user_id = ${BigInt(ids[0])}`;
      return 'commit';
    }).then((v) => v, brief);
    const ms = Date.now() - started;
    await ctl.stop();
    const written = (await rows('SELECT COUNT(*) AS n FROM users WHERE name = ?', marker))[0].n;
    const next = await prisma.$transaction((tx) => tx.user.findUnique({ where: { userId: BigInt(ids[0]) }, select: { userId: true } }))
      .then((u) => (u ? 'ok' : 'SALAH-null'), (e) => ({ ...brief(e), panic: isPanic(e) }));
    result[k] = { outcome, ms, waits: ctl.order.length, written: Number(written), next, probeRetries: [...probeRetries] };
  }
  record(FILE, 'I4', { ...result, leftover: await appHeldLocks() });
  assert.equal(result[7].outcome, 'commit');
  assert.ok(result[7].ms < 15000, `7 wait ms=${result[7].ms}`);
  assert.equal(result[7].written, 1);
  assert.equal(result[8].outcome.code, 'P2028');
  assert.equal(result[8].written, 0, 'rollback bersih: UPDATE tidak tersimpan');
  assert.equal(result[7].next, 'ok');
  assert.equal(result[8].next, 'ok', 'transaksi setelah P2028 berhasil');
  assert.deepEqual(await appHeldLocks(), []);
});

test('I5 HTTP: checkout 10 produk dengan semua kunci diperebutkan (P2028) → checkout berikutnya 201 tanpa panic, auth 200', async () => {
  const c1 = await createUser('customer');
  const body = await orderBody(c1, readyProducts);
  const holders = [
    await rowHolder('users', 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [c1], (w) => w.waiting_table === 'users' && w.waiting_data === String(c1)),
    await rowHolder('store_settings', 'SELECT setting_id FROM store_settings WHERE setting_id = 1 FOR UPDATE', [], (w) => w.waiting_table === 'store_settings'),
  ];
  for (const p of readyProducts) holders.push(await rowHolder(`ds${p}`, 'SELECT stock_id FROM daily_stocks WHERE product_id = ? AND stock_date = ? FOR UPDATE', [p, TODAY], (w) => w.waiting_table === 'daily_stocks' && String(w.waiting_data).startsWith(`${p},`)));
  const logOffset = server.readLog().length;
  const stockBefore = await rows('SELECT product_id, qty_sold FROM daily_stocks WHERE stock_date = ? AND product_id IN (' + readyProducts.join(',') + ') ORDER BY product_id', TODAY);
  const ctl = releaseOnWait(holders, 1940);
  const contended = await call(server, 'POST', '/api/orders', { userId: c1, body });
  await ctl.stop();
  await sleep(300);
  const stockAfterContended = await rows('SELECT product_id, qty_sold FROM daily_stocks WHERE stock_date = ? AND product_id IN (' + readyProducts.join(',') + ') ORDER BY product_id', TODAY);
  const next = [];
  for (let i = 0; i < 3; i += 1) {
    const c = await createUser('customer');
    const r = await placeOrder(c, readyProducts.slice(0, 2));
    const auth = await call(server, 'GET', '/api/me/profile', { userId: c });
    next.push({ checkout: r.status, auth: auth.status });
  }
  const log = server.readLog().slice(logOffset);
  const result = {
    contended: { status: contended.status, ms: contended.ms, waits: ctl.order.length }, next,
    ordersOfC1: Number((await rows('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', c1))[0].n),
    stockUnchanged: JSON.stringify(stockBefore) === JSON.stringify(stockAfterContended),
    panic: /RustPanic|panicked/.test(log), p1017: /P1017|P1001/.test(log.replace(/\[DB\] Probe transaksi gagal[^\n]*/g, '')),
    probeWarnings: (log.match(/\[DB\] Probe transaksi gagal[^\n]*/g) ?? []),
  };
  record(FILE, 'I5', result);
  assert.equal(contended.status, 500);
  assert.equal(result.ordersOfC1, 0, 'checkout yang gagal tidak meninggalkan pesanan');
  assert.equal(result.stockUnchanged, true, 'stok tidak berubah (rollback bersih)');
  assert.deepEqual(next, [{ checkout: 201, auth: 200 }, { checkout: 201, auth: 200 }, { checkout: 201, auth: 200 }]);
  assert.equal(result.panic, false, 'tanpa Rust panic');
  assert.equal(result.p1017, false, 'tanpa P1017/P1001 yang sampai ke request');
});

test(`I6 checkout × pembatalan pelanggan yang SAMA (dulu deadlock 6/6) × ${ROUNDS} → tanpa deadlock, keduanya sukses, data konsisten`, async () => {
  await db.$executeRawUnsafe(`INSERT INTO vouchers (code, title, discount_type, discount_value, product_id, quota, valid_from, valid_to, is_active)
    VALUES (?, 'Voucher uji integrasi', 'amount', 1000, NULL, 100000, '2020-01-01', '2099-12-31', 1)`, unique('V').slice(0, 20));
  const [{ id: V }] = await rows("SELECT voucher_id AS id FROM vouchers WHERE title = 'Voucher uji integrasi' ORDER BY voucher_id DESC LIMIT 1");
  const A = readyProducts[0];
  const before = await innodbMetrics();
  const summary = { rounds: ROUNDS, statuses: {}, inconsistent: [], checkoutWaitedOn: {} };
  for (let round = 0; round < ROUNDS; round += 1) {
    const C = await createUser('customer');
    const made = await placeOrder(C, [A]);
    assert.equal(made.status, 201);
    const O = made.body.data.order_number;
    await db.$executeRawUnsafe('UPDATE orders SET voucher_id = ? WHERE order_number = ?', V, O);
    await db.$executeRawUnsafe('INSERT INTO user_vouchers (user_id, voucher_id, claimed_at, used_at) VALUES (?, ?, NOW(), NOW())', C, V);
    const snap = async () => ({
      qtySold: Number((await rows('SELECT qty_sold AS n FROM daily_stocks WHERE product_id = ? AND stock_date = ?', A, TODAY))[0].n),
      quota: Number((await rows('SELECT quota AS n FROM vouchers WHERE voucher_id = ?', V))[0].n),
      claimUsed: Number((await rows('SELECT used_at IS NOT NULL AS n FROM user_vouchers WHERE user_id = ? AND voucher_id = ?', C, V))[0].n),
      orders: Number((await rows('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', C))[0].n),
      histories: Number((await rows("SELECT COUNT(*) AS n FROM order_status_histories h JOIN orders o ON o.order_id = h.order_id WHERE o.order_number = ? AND h.status = 'dibatalkan'", O))[0].n),
    });
    const s0 = await snap();
    // Pembatalan ditahan di voucher (meniru AD-09 lockVoucher) — dulu: sambil memegang daily_stocks A
    const h = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT voucher_id FROM vouchers WHERE voucher_id = ? FOR UPDATE', V));
    await h.ready;
    const cancel = call(server, 'PATCH', `/api/orders/${O}/cancel`, { userId: C, body: { reason: 'Uji regresi deadlock' } });
    await waitForAppLockWait((w) => w.waiting_table === 'vouchers');
    const coBody = await orderBody(C, [A]);
    const checkoutP = call(server, 'POST', '/api/orders', { userId: C, body: coBody });
    const waits = await waitForAppLockWait((w) => w.waiting_table !== 'vouchers'); // checkout menunggu sesuatu milik pembatalan
    const checkoutWait = waits.find((w) => w.waiting_table !== 'vouchers');
    summary.checkoutWaitedOn[checkoutWait.waiting_table] = (summary.checkoutWaitedOn[checkoutWait.waiting_table] ?? 0) + 1;
    await h.release();
    const [cr, kr] = await Promise.all([cancel, checkoutP]);
    const key = `cancel ${cr.status} / checkout ${kr.status}`;
    summary.statuses[key] = (summary.statuses[key] ?? 0) + 1;
    const s1 = await snap();
    const expected = { qtySold: s0.qtySold - 1 + 1, quota: s0.quota + 1, claimUsed: 0, orders: s0.orders + 1, histories: 1 };
    if (JSON.stringify(s1) !== JSON.stringify(expected)) summary.inconsistent.push({ round, s0, s1, expected });
  }
  const after = await innodbMetrics();
  summary.deadlocks = after.lock_deadlocks - before.lock_deadlocks;
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  summary.leftover = await appHeldLocks();
  record(FILE, 'I6', summary);
  assert.equal(summary.deadlocks, 0, JSON.stringify(summary.statuses));
  assert.deepEqual(summary.statuses, { 'cancel 200 / checkout 201': ROUNDS });
  assert.deepEqual(summary.inconsistent, []);
  assert.deepEqual(summary.checkoutWaitedOn, { users: ROUNDS }, 'checkout kini menunggu di baris users (sebelum daily_stocks), bukan di daily_stocks');
  assert.deepEqual(summary.leftover, []);
});

test(`I7 beban campuran × ${ROUNDS}: checkout + pembatalan (pelanggan sama & beda) + AD-04 Selesai + AD-11 PATCH → tanpa deadlock, tanpa 5xx`, async () => {
  const before = await innodbMetrics();
  const statuses = {};
  const add = (kind, rs) => Object.entries(tally(rs)).forEach(([s, c]) => { statuses[`${kind} ${s}`] = (statuses[`${kind} ${s}`] ?? 0) + c; });
  for (let round = 0; round < ROUNDS; round += 1) {
    const owner = await createUser('owner');
    const staff = await createUser('staf');
    await onlyTheseOwnersActive([owner]);
    const customers = [];
    for (let i = 0; i < 4; i += 1) customers.push(await createUser('customer'));
    const toCancel = [];
    for (const c of customers.slice(0, 2)) toCancel.push({ c, o: (await placeOrder(c, readyProducts.slice(0, 3))).body.data.order_number });
    const toComplete = [];
    for (const c of customers.slice(2)) {
      const o = (await placeOrder(c, readyProducts.slice(1, 3))).body.data.order_number;
      toComplete.push({ o, ...(await prepareOrder(o, ORDER_STATUS.SIAP_DIAMBIL)) });
    }
    const jobs = [
      ...customers.map((c) => ['checkout', () => placeOrder(c, readyProducts.slice(0, 3))]),
      ...toCancel.map(({ c, o }) => ['cancel', () => call(server, 'PATCH', `/api/orders/${o}/cancel`, { userId: c, body: { reason: 'Uji beban' } })]),
      ...toComplete.map(({ o, pickup_code: code }) => ['ad04', () => changeStatus(server, staff, o, nextStepBody(ORDER_STATUS.SIAP_DIAMBIL, code))]),
      ['patch', () => patchActive(server, owner, staff, false)],
      ['patch', () => patchActive(server, owner, staff, true)],
    ];
    const results = await Promise.all(jobs.map(([, run]) => run()));
    ['checkout', 'cancel', 'ad04', 'patch'].forEach((kind) => add(kind, results.filter((_, i) => jobs[i][0] === kind)));
  }
  await sleep(300);
  const after = await innodbMetrics();
  const summary = { rounds: ROUNDS, statuses, deadlocks: after.lock_deadlocks - before.lock_deadlocks, lockTimeouts: after.lock_timeouts - before.lock_timeouts, leftover: await appHeldLocks() };
  if (summary.deadlocks) summary.latestDeadlock = await latestDeadlockSection();
  record(FILE, 'I7', summary);
  assert.equal(summary.deadlocks, 0, JSON.stringify(statuses));
  assert.ok(!Object.keys(statuses).some((k) => / 5\d\d$/.test(k)), JSON.stringify(statuses));
  assert.deepEqual(summary.leftover, []);
});
