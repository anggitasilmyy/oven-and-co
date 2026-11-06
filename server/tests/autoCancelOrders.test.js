// Step 6.5 C2 · FR-38 · BR-06 — jobs/autoCancelOrders.js: pemilihan kandidat, efek pembatalan (stok, voucher, poin,
// riwayat sistem, notifikasi), pemeriksaan ulang setelah kunci, idempotensi, rollback per pesanan, email setelah commit,
// dan penjadwal (tanpa tumpang tindih, nonaktif saat test, shutdown menunggu putaran).
// Prisma dipalsukan (helpers/orderDb.js) — TIDAK membuktikan locking InnoDB (lihat tests-mysql/13-auto-cancel-online).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installOrderDb } = require('./helpers/orderDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const job = require('../src/jobs/autoCancelOrders');

const NOW = new Date('2026-10-20T01:00:00Z'); // Selasa 08.00 WIB
const EXPIRES = new Date(NOW.getTime() + 30 * 60000);
const after = (ms) => new Date(EXPIRES.getTime() + ms);
const dayKey = (n) => new Date(Date.UTC(2026, 9, 20 + n)).toISOString().slice(0, 10);
const dbDay = (n) => new Date(`${dayKey(n)}T00:00:00.000Z`);
const REASON = 'Tidak dibayar dalam 30 menit (BR-06)';

let db;
let server;
let baseUrl;
let logs;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach((t) => {
  db = installOrderDb(fakePrisma, { today: dbDay(0), plusDays: dbDay });
  logs = { email: [], error: [], info: [] };
  t.mock.method(console, 'info', (line) => (String(line).startsWith('[DEV EMAIL]') ? logs.email : logs.info).push(String(line)));
  t.mock.method(console, 'error', (...args) => logs.error.push(args.join(' ')));
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, path, sub, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(sub)}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const place = async (overrides = {}, sub = '1') => {
  const res = await call('POST', '/orders', sub, {
    items: [{ cart_item_id: 'c1', product_id: '1', quantity: 2 }], fulfillment: 'pickup', address_id: null,
    ready_date: dayKey(0), time_slot: '09.00–11.00', voucher_code: null, use_points: false, method_code: 'qris', ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.data.order_number;
};
const orderRow = (number) => db.t.orders.find((o) => o.orderNumber === number);
const paymentOf = (number) => db.t.payments.find((p) => p.orderId === orderRow(number).orderId);
const historyOf = (number) => db.t.statusHistories.filter((h) => h.orderId === orderRow(number).orderId);
const noticesOf = (number) => db.t.notifications.filter((n) => n.orderId === orderRow(number).orderId);
const stockSold = () => db.t.dailyStocks.find((s) => s.productId === 1n).qtySold;
const snapshot = () => JSON.stringify(db.t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));

// ── Kandidat & batas waktu ───────────────────────────────────────────────────────────────────────

test('batas waktu: sebelum & tepat expired_at tidak ada yang dibatalkan; sesudahnya hanya pesanan online pending', async () => {
  const overdue = await place();
  const store = await place({ method_code: 'pay_at_store' });
  const paid = await place();
  assert.equal((await call('POST', `/payments/${paid}/simulate-paid`, '1')).status, 200);
  const before = snapshot();

  for (const now of [after(-1000), after(0)]) {
    assert.deepEqual(await job.runAutoCancel({ now }), { cancelled: [], skipped: [], failed: [], stopped: false, queryError: null });
  }
  assert.equal(snapshot(), before);

  const summary = await job.runAutoCancel({ now: after(1000) });
  assert.deepEqual(summary, { cancelled: [overdue], skipped: [], failed: [], stopped: false, queryError: null });
  assert.equal(orderRow(store).orderStatus, 'dikonfirmasi');
  assert.equal(orderRow(paid).orderStatus, 'dikonfirmasi');
  assert.equal(paymentOf(paid).status, 'paid');
});

test('efek BR-06: Dibatalkan + alasan, unpaid, payment expired, stok/voucher/poin kembali, riwayat sistem, notifikasi', async () => {
  const number = await place({ voucher_code: 'HEMAT10', use_points: true });
  const order = orderRow(number);
  assert.ok(order.pointsUsed > 0);
  assert.equal(stockSold(), 4);
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 4);
  const balanceBefore = db.t.pointTransactions.filter((p) => p.userId === 1n).reduce((n, p) => n + p.points, 0);
  logs.email.length = 0;

  await job.runAutoCancel({ now: after(1000) });

  assert.deepEqual([order.orderStatus, order.cancelReason, order.paymentStatus], ['dibatalkan', REASON, 'unpaid']);
  assert.equal(paymentOf(number).status, 'expired');
  assert.equal(stockSold(), 2, 'stok ready kembali (TF-12)');
  assert.equal(db.t.vouchers.find((v) => v.voucherId === 1n).quota, 5, 'kuota voucher +1');
  assert.equal(db.t.userVouchers.find((c) => c.userId === 1n && c.voucherId === 1n).usedAt, null, 'klaim bisa dipakai lagi');
  const refunds = db.t.pointTransactions.filter((p) => p.type === 'refund' && p.orderId === order.orderId);
  assert.deepEqual(refunds.map((p) => p.points), [order.pointsUsed]);
  const balanceAfter = db.t.pointTransactions.filter((p) => p.userId === 1n).reduce((n, p) => n + p.points, 0);
  assert.equal(balanceAfter, balanceBefore + order.pointsUsed);
  assert.deepEqual(historyOf(number).map((h) => [h.status, h.changedBy, h.note]), [
    ['menunggu_pembayaran', 1n, null], ['dibatalkan', null, REASON],
  ]);
  assert.deepEqual(noticesOf(number).slice(1).map((n) => [n.userId, n.type, n.title, n.body]), [
    [1n, 'order_status', 'Pesanan dibatalkan', `Pesanan ${number} dibatalkan. Alasan: ${REASON}`],
    [1n, 'points', `+${order.pointsUsed.toLocaleString('id-ID')} poin`, `Poin bertambah dari pembatalan pesanan ${number}.`],
  ]);
  assert.equal(logs.email.length, 2);
  // Urutan pernyataan (urutan saja — bukti locking di MySQL): kunci pesanan → riwayat & notifikasi → UPDATE payments → stok
  const tail = db.ops.slice(db.ops.lastIndexOf('tx:begin'));
  assert.equal(tail[1], 'lock:orders');
  assert.ok(tail.lastIndexOf('notification.create') < tail.indexOf('payment.updateMany'));
  assert.ok(tail.indexOf('payment.updateMany') < tail.indexOf('executeRaw'));
});

test('idempoten: putaran berikutnya tidak menemukan kandidat dan tidak menulis apa pun', async () => {
  const number = await place({ use_points: true });
  await job.runAutoCancel({ now: after(1000) });
  const once = snapshot();
  for (let i = 0; i < 3; i += 1) assert.deepEqual(await job.runAutoCancel({ now: after(60000 * (i + 1)) }), { cancelled: [], skipped: [], failed: [], stopped: false, queryError: null });
  assert.equal(snapshot(), once);
  assert.equal(historyOf(number).length, 2);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 1);
});

// ── Pemeriksaan ulang setelah kunci ───────────────────────────────────────────────────────────────

for (const [label, change, expected] of [
  ['pembayaran lunas', (o, p) => { o.paymentStatus = 'paid'; o.orderStatus = 'dikonfirmasi'; p.status = 'paid'; }, 'dikonfirmasi'],
  ['pelanggan membatalkan', (o, p) => { o.orderStatus = 'dibatalkan'; p.status = 'failed'; }, 'dibatalkan'],
  ['proses job lain membatalkan', (o, p) => { o.orderStatus = 'dibatalkan'; p.status = 'expired'; }, 'dibatalkan'],
  ['ganti ke Bayar di Toko', (o) => { o.paymentOption = 'pay_at_store'; o.orderStatus = 'dikonfirmasi'; }, 'dikonfirmasi'],
]) {
  test(`status berubah selagi job menunggu kunci (${label}) → dilewati tanpa menulis apa pun`, async () => {
    const number = await place({ use_points: true });
    db.hooks.whileWaitingOrderLock = () => { change(orderRow(number), paymentOf(number)); db.hooks.whileWaitingOrderLock = null; };
    const committedByOther = () => snapshot();
    const summary = await job.runAutoCancel({ now: after(1000) });
    const state = committedByOther();
    assert.deepEqual(summary, { cancelled: [], skipped: [number], failed: [], stopped: false, queryError: null });
    assert.equal(orderRow(number).orderStatus, expected);
    assert.equal(historyOf(number).length, 1, 'tanpa riwayat dari job');
    assert.equal(noticesOf(number).length, 1, 'tanpa notifikasi dari job');
    assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 0, 'tanpa refund dari job');
    assert.equal(stockSold(), 4, 'stok tidak dikembalikan job');
    assert.equal(snapshot(), state);
  });
}

// ── Rollback & error per pesanan ─────────────────────────────────────────────────────────────────

test('rollback per pesanan: gagal di tengah → pesanan itu utuh tanpa email & dicatat; pesanan lain tetap dibatalkan', async () => {
  const first = await place({ use_points: true });
  const second = await place({}, '2');
  logs.email.length = 0;
  const firstBefore = JSON.stringify({ o: orderRow(first), p: paymentOf(first), stock: stockSold() }, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  let writes = 0;
  const create = fakePrisma.notification.create;
  fakePrisma.notification.create = async (args) => {
    writes += 1;
    if (writes === 2) throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' }); // notifikasi poin pesanan pertama
    return create(args);
  };

  const summary = await job.runAutoCancel({ now: after(1000) });

  assert.deepEqual(summary.cancelled, [second]);
  assert.deepEqual(summary.failed.map((f) => f.order_number), [first]);
  assert.match(summary.failed[0].error, /^P1001: /);
  assert.equal(orderRow(first).orderStatus, 'menunggu_pembayaran');
  assert.equal(paymentOf(first).status, 'pending');
  assert.equal(historyOf(first).length, 1);
  assert.equal(noticesOf(first).length, 1);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 0);
  assert.equal(stockSold(), 4 + 2 - 2, 'hanya stok pesanan kedua yang kembali');
  assert.ok(firstBefore.includes('"orderStatus":"menunggu_pembayaran"'));
  assert.equal(logs.email.length, 1, 'email hanya untuk pesanan yang commit');
  assert.ok(logs.email[0].includes(second));
  assert.ok(logs.error.some((line) => line.includes(`Gagal membatalkan ${first}`) && line.includes('P1001')), logs.error.join('\n'));

  // Putaran berikutnya mencoba lagi pesanan yang gagal
  fakePrisma.notification.create = create;
  assert.deepEqual((await job.runAutoCancel({ now: after(61000) })).cancelled, [first]);
});

test('kandidat dibatasi batchSize; sisanya di putaran berikutnya', async () => {
  const numbers = [await place(), await place({}, '2'), await place()];
  assert.deepEqual((await job.runAutoCancel({ now: after(1000), batchSize: 2 })).cancelled, numbers.slice(0, 2));
  assert.deepEqual((await job.runAutoCancel({ now: after(1000), batchSize: 2 })).cancelled, numbers.slice(2));
});

// ── Penjadwal ─────────────────────────────────────────────────────────────────────────────────────

test('penjadwal: nonaktif saat NODE_ENV=test atau AUTO_CANCEL_ENABLED=false', () => {
  assert.equal(job.isAutoCancelEnabled({ NODE_ENV: 'test' }), false);
  assert.equal(job.isAutoCancelEnabled({ NODE_ENV: 'development', AUTO_CANCEL_ENABLED: 'false' }), false);
  assert.equal(job.isAutoCancelEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(job.isAutoCancelEnabled({ NODE_ENV: 'production' }), true);
  let scheduled = 0;
  assert.equal(job.startAutoCancelJob({ env: { NODE_ENV: 'test' }, schedule: () => { scheduled += 1; } }), false);
  assert.equal(scheduled, 0);
});

test('putaran yang melempar error dicatat dan flag dilepas', async () => {
  await job.tick(async () => { throw Object.assign(new Error('db down'), { code: 'P1001' }); });
  assert.ok(logs.error.some((line) => line.includes('Putaran gagal') && line.includes('P1001')));
  let ran = false;
  await job.tick(async () => { ran = true; });
  assert.equal(ran, true);
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const fakeTask = () => ({ stopped: false, destroyed: false, stop() { this.stopped = true; }, destroy() { this.destroyed = true; } });

test('penjadwal: satu jadwal tiap menit, putaran pertama saat start, tick tidak tumpang tindih, shutdown menunggu', async () => {
  let release = () => {};
  let runs = 0;
  const run = () => { runs += 1; return new Promise((resolve) => { release = resolve; }); };
  const cronTask = fakeTask();
  let onTick;
  let cronExpr;
  const schedule = (expr, fn) => { cronExpr = expr; onTick = fn; return cronTask; };

  try {
    assert.equal(job.startAutoCancelJob({ env: { NODE_ENV: 'development' }, schedule, run }), true);
    await settle();
    assert.equal(cronExpr, '* * * * *');
    assert.equal(runs, 1, 'putaran pertama langsung saat start');
    assert.equal(job.startAutoCancelJob({ env: { NODE_ENV: 'development' }, schedule, run }), false, 'tidak ada penjadwal kedua');

    onTick();
    onTick();
    await settle();
    assert.equal(runs, 1, 'tick selama putaran berjalan dilewati');

    let done = false;
    const stopping = job.stopAutoCancelJob().then(() => { done = true; });
    await settle();
    assert.equal(cronTask.stopped, true, 'cron dihentikan lebih dulu');
    assert.equal(job.isStopping(), true);
    assert.equal(done, false, 'shutdown menunggu putaran yang berjalan');
    release();
    await stopping;
    assert.equal(done, true);
    assert.equal(cronTask.destroyed, true);

    // Setelah shutdown diminta, tick (mis. cron yang terlambat) tidak memulai putaran baru
    await job.tick(async () => { runs += 1; });
    assert.equal(runs, 1);
  } finally {
    release();
    await job.stopAutoCancelJob();
  }
});

test('shutdown menunggu putaran SAMPAI SELESAI walau melewati batas log (tidak ada timeout yang memotong)', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(String(line)));
  let release;
  let finished = false;
  job.startAutoCancelJob({
    env: { NODE_ENV: 'development' }, schedule: () => fakeTask(),
    run: () => new Promise((resolve) => { release = () => { finished = true; resolve(); }; }),
  });
  await settle();
  let stopped = false;
  try {
    const stopping = job.stopAutoCancelJob({ logAfterMs: 20 }).then(() => { stopped = true; });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(stopped, false, 'masih menunggu setelah batas log');
    assert.ok(warnings.some((w) => w.includes('Masih menunggu putaran selesai')), warnings.join('\n'));
    release();
    await stopping;
    assert.equal(finished && stopped, true);
  } finally {
    release(); // jangan tinggalkan putaran menggantung bila asersi gagal
    await job.stopAutoCancelJob();
  }
});

test('runAutoCancel: shutdown diminta sebelum putaran → tidak ada query maupun transaksi', async () => {
  await place();
  const opsBefore = db.ops.length;
  assert.deepEqual(await job.runAutoCancel({ now: after(1000), shouldStop: () => true }),
    { cancelled: [], skipped: [], failed: [], stopped: true, queryError: null });
  assert.deepEqual(db.ops.slice(opsBefore), []);
});

/**
 * Shutdown diminta selagi job memegang kunci pesanan pertama (kait whileWaitingOrderLock = kunci baru didapat) dan
 * transaksinya masih berjalan. Dicatat urutan: tx:begin / tx:end (commit atau rollback) / disconnect.
 */
async function shutdownDuringFirstTransaction({ failFirst }) {
  const numbers = [await place({ use_points: true }), await place({}, '2'), await place()];
  logs.email.length = 0; // email checkout bukan bagian uji ini
  const events = [];
  const realTransaction = fakePrisma.$transaction;
  fakePrisma.$transaction = async (callback) => {
    events.push('tx:begin');
    try {
      return await realTransaction(callback);
    } finally {
      events.push('tx:end');
    }
  };
  let stopPromise;
  db.hooks.whileWaitingOrderLock = () => {
    db.hooks.whileWaitingOrderLock = null;
    stopPromise = job.stopAutoCancelJob(); // SIGTERM tiba: flag stopping dipasang seketika
    events.push('stop-requested');
    if (failFirst) db.failOn = 'notification.create';
  };
  let summary;
  try {
    job.startAutoCancelJob({
      env: { NODE_ENV: 'development' }, schedule: () => fakeTask(),
      run: async () => { summary = await job.runAutoCancel({ now: after(1000) }); },
    });
    await settle();
    while (!stopPromise) await settle();
    await stopPromise; // server.js: prisma.$disconnect baru setelah ini
    events.push('disconnect');
  } finally {
    fakePrisma.$transaction = realTransaction;
    db.failOn = null;
  }
  return { numbers, events, summary };
}

test('shutdown saat transaksi berjalan (memegang kunci): pesanan itu commit utuh, kandidat berikutnya tidak diproses, disconnect terakhir', async () => {
  const { numbers, events, summary } = await shutdownDuringFirstTransaction({ failFirst: false });
  assert.deepEqual(events, ['tx:begin', 'stop-requested', 'tx:end', 'disconnect']);
  assert.deepEqual(summary, { cancelled: [numbers[0]], skipped: [], failed: [], stopped: true, queryError: null });
  const first = orderRow(numbers[0]);
  assert.deepEqual([first.orderStatus, paymentOf(numbers[0]).status], ['dibatalkan', 'expired']);
  assert.equal(historyOf(numbers[0]).length, 2);
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 1, 'efek pesanan pertama lengkap');
  for (const n of numbers.slice(1)) {
    assert.deepEqual([orderRow(n).orderStatus, paymentOf(n).status, historyOf(n).length, noticesOf(n).length],
      ['menunggu_pembayaran', 'pending', 1, 1], `${n} tidak disentuh`);
  }
  assert.equal(stockSold(), 4 + 2 + 2 - 2, 'hanya stok pesanan pertama yang kembali');
  assert.ok(logs.info.some((l) => l.includes('Shutdown diminta — 2 kandidat tersisa tidak diproses.')), logs.info.join('\n'));
  assert.equal(logs.email.length, 2, 'email pesanan pertama dicetak sebelum disconnect');
});

test('shutdown saat transaksi berjalan lalu transaksi gagal: rollback utuh, kandidat berikutnya tidak diproses, disconnect terakhir', async () => {
  const { numbers, events, summary } = await shutdownDuringFirstTransaction({ failFirst: true });
  assert.deepEqual(events, ['tx:begin', 'stop-requested', 'tx:end', 'disconnect']);
  assert.deepEqual(summary.cancelled, []);
  assert.deepEqual(summary.failed.map((f) => f.order_number), [numbers[0]]);
  assert.equal(summary.stopped, true);
  for (const n of numbers) {
    assert.deepEqual([orderRow(n).orderStatus, paymentOf(n).status, historyOf(n).length, noticesOf(n).length],
      ['menunggu_pembayaran', 'pending', 1, 1], `${n} tanpa data parsial`);
  }
  assert.equal(db.t.pointTransactions.filter((p) => p.type === 'refund').length, 0);
  assert.equal(stockSold(), 4 + 2 + 2);
  assert.deepEqual(logs.email, [], 'tanpa email untuk transaksi yang di-rollback');
});

// ── Query kandidat (di luar transaksi, MAX_EXECUTION_TIME) ────────────────────────────────────────

test('query kandidat: MAX_EXECUTION_TIME 5000 ms di teks SQL, semua nilai lain sebagai parameter', async () => {
  await place();
  await job.runAutoCancel({ now: after(1000), batchSize: 7, shouldStop: () => false });
  assert.match(db.candidateSql, /^SELECT \/\*\+ MAX_EXECUTION_TIME\(5000\) \*\/ DISTINCT/);
  assert.match(db.candidateSql, /WHERE o\.order_status = \? AND o\.payment_option = \? AND o\.payment_status = \? AND p\.status = \? AND p\.expired_at < \?/);
  assert.match(db.candidateSql, /LIMIT \?$/);
  assert.ok(!/menunggu_pembayaran|online|pending|unpaid|\b7\b/.test(db.candidateSql), 'nilai tidak disisipkan ke teks SQL');
});

test('query kandidat gagal (ER 3024 MAX_EXECUTION_TIME) → dicatat jelas, tanpa transaksi, putaran berikutnya normal', async () => {
  const number = await place();
  db.hooks.candidateQuery = async () => {
    db.hooks.candidateQuery = null;
    throw Object.assign(new Error('\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\nRaw query failed. Code: `3024`. Message: `Query execution was interrupted, maximum statement execution time exceeded`'), { code: 'P2010' });
  };
  const opsBefore = db.ops.length;
  const summary = await job.runAutoCancel({ now: after(1000), shouldStop: () => false });
  assert.deepEqual([summary.cancelled, summary.failed, summary.stopped], [[], [], false]);
  assert.equal(summary.queryError, 'P2010: Raw query failed. Code: `3024`. Message: `Query execution was interrupted, maximum statement execution time exceeded`');
  assert.deepEqual(db.ops.slice(opsBefore), ['candidateQuery'], 'tidak ada transaksi');
  assert.ok(logs.error.some((l) => l.includes('Query kandidat BR-06 gagal') && l.includes('3024')), logs.error.join('\n'));
  assert.deepEqual((await job.runAutoCancel({ now: after(1000), shouldStop: () => false })).cancelled, [number]);
});

/**
 * Shutdown diminta selagi query kandidat masih berjalan (kait candidateQuery menahan query). Dicatat urutan peristiwa;
 * `outcome` = 'resolve' (query selesai dengan kandidat) atau 'timeout' (query dihentikan MySQL, ER 3024).
 */
async function shutdownDuringCandidateQuery(outcome) {
  const numbers = [await place(), await place({}, '2')];
  const events = [];
  let finishQuery;
  db.hooks.candidateQuery = () => new Promise((resolve, reject) => {
    events.push('query:start');
    let done = false;
    finishQuery = () => {
      if (done) return; // pembersihan di finally tidak menambah peristiwa
      done = true;
      events.push('query:end');
      if (outcome === 'timeout') reject(Object.assign(new Error('Raw query failed. Code: `3024`. Message: `maximum statement execution time exceeded`'), { code: 'P2010' }));
      else resolve();
    };
  });
  const realTransaction = fakePrisma.$transaction;
  fakePrisma.$transaction = async (callback) => { events.push('tx:begin'); return realTransaction(callback); };
  let summary;
  let stopped = false;
  try {
    job.startAutoCancelJob({
      env: { NODE_ENV: 'development' }, schedule: () => fakeTask(),
      run: async () => { summary = await job.runAutoCancel({ now: after(1000) }); },
    });
    while (!finishQuery) await settle();
    const stopping = job.stopAutoCancelJob().then(() => { stopped = true; events.push('disconnect'); });
    events.push('stop-requested');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(stopped, false, 'shutdown menunggu query kandidat yang masih berjalan');
    finishQuery();
    await stopping;
  } finally {
    fakePrisma.$transaction = realTransaction;
    db.hooks.candidateQuery = null;
    finishQuery?.();
    await job.stopAutoCancelJob();
  }
  return { numbers, events, summary };
}

test('shutdown saat query kandidat berjalan: disconnect setelah query selesai, tidak ada transaksi kandidat setelah shutdown', async () => {
  const { numbers, events, summary } = await shutdownDuringCandidateQuery('resolve');
  assert.deepEqual(events, ['query:start', 'stop-requested', 'query:end', 'disconnect']);
  assert.equal(summary.stopped, true);
  assert.deepEqual([summary.cancelled, summary.failed], [[], []]);
  for (const n of numbers) assert.deepEqual([orderRow(n).orderStatus, paymentOf(n).status], ['menunggu_pembayaran', 'pending']);
  assert.ok(logs.info.some((l) => l.includes('Shutdown diminta — 2 kandidat tersisa tidak diproses.')));
});

test('shutdown saat query kandidat berjalan lalu query timeout: error dicatat, disconnect setelah query berhenti, tanpa transaksi', async () => {
  const { numbers, events, summary } = await shutdownDuringCandidateQuery('timeout');
  assert.deepEqual(events, ['query:start', 'stop-requested', 'query:end', 'disconnect']);
  assert.match(summary.queryError, /3024/);
  assert.deepEqual([summary.cancelled, summary.failed], [[], []]);
  for (const n of numbers) assert.deepEqual([orderRow(n).orderStatus, paymentOf(n).status], ['menunggu_pembayaran', 'pending']);
  assert.ok(logs.error.some((l) => l.includes('Query kandidat BR-06 gagal') && l.includes('3024')));
});

test('describeError: kode + pesan database (baris terakhir pesan Prisma / meta.message), dibatasi 300 karakter', () => {
  const prismaLike = Object.assign(new Error('\nInvalid `tx.notification.create()` invocation in\n/x.js:19:25\n\n  16 const a = 1;\n→ 19 await tx...\nRaw query failed. Code: `1644`. Message: `uji rollback C2`'), { name: 'PrismaClientUnknownRequestError' });
  assert.equal(job.describeError(prismaLike), 'PrismaClientUnknownRequestError: Raw query failed. Code: `1644`. Message: `uji rollback C2`');
  assert.equal(job.describeError(Object.assign(new Error('x'), { code: 'P2010', meta: { message: 'Deadlock found' } })), 'P2010: Deadlock found');
  assert.equal(job.describeError(Object.assign(new Error('x'), { code: 'P2010', meta: { code: '3024', message: 'Query execution was interrupted' } })),
    'P2010 (MySQL 3024): Query execution was interrupted');
  assert.equal(job.describeError(Object.assign(new Error('Lock wait timeout exceeded'), { code: 'P1001' })), 'P1001: Lock wait timeout exceeded');
  assert.equal(job.describeError(new Error('a'.repeat(500))).length, 300);
});
