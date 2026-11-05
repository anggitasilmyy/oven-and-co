// tests-mysql/05-staff-timeout.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · C3c PATCH — perilaku saat request menunggu kunci.
// Tiga batas waktu yang BERBEDA (dibuktikan terpisah):
//   timeout  (Prisma interactive transaction, bawaan 5000 ms) — umur maksimum transaksi; hanya diperiksa di antara query;
//   maxWait  (Prisma, bawaan 2000 ms) — lama maksimum menunggu KONEKSI dari pool untuk memulai transaksi;
//   innodb_lock_wait_timeout (MySQL; global server tetap 50 s, aplikasi memasang 2 s per transaksi interaktif — perbaikan
//   F-2, src/lib/transactionLockWait.js) — lama maksimum satu pernyataan menunggu kunci baris (error 1205).
// Sebelum F-2: lock wait > 5 s → Prisma menutup transaksi selagi pernyataan masih antre → query berikutnya di koneksi pool
// yang sama salah (401 SESSION_INVALID palsu, lalu P1017). Setiap skenario memeriksa: status HTTP, kode error di log
// server, tidak ada perubahan data, tidak ada kunci/transaksi aplikasi yang tertinggal, dan 5 request lanjutan benar.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  db, rows, holdTransaction, waitForAppLockWaits, appLockWaits, appHeldLocks, appOpenTransactions, sleep, record,
  startGeneralLog, stopGeneralLog,
} = require('./helpers/context');
const { startServer, patchActive, call } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, isActive, usersSnapshot, checkout } = require('./helpers/fixtures');

const FILE = '05-staff-timeout';
const LOCK_SQL = 'SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE';
const servers = [];

test.after(async () => { await Promise.all(servers.map((s) => s.stop())); await db.$disconnect(); });

async function server(name, options) {
  const s = await startServer(`${FILE}-${name}`, options);
  servers.push(s);
  return s;
}

/** Ringkas error Prisma yang dicatat errorHandler sejak offset log tertentu */
function prismaErrorsIn(log) {
  return [...log.matchAll(/\[API Error\] (\w+):[\s\S]*?(?:code: '(\w+)'|errorCode: '(\w+)')/g)]
    .map((m) => ({ error: m[1], code: m[2] ?? m[3] }))
    .concat([...log.matchAll(/(Transaction API error: [^\n]+|Transaction already closed[^\n]*|Code: `\d+`. Message: `[^`]+`)/g)].map((m) => ({ text: m[1] })));
}

/** Pantau kunci & transaksi aplikasi selama ms tertentu (mencari kunci "zombie") */
async function watchApp(ms) {
  const seen = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [locks, trx] = await Promise.all([appHeldLocks(), appOpenTransactions()]);
    if (locks.length || trx.length) seen.push({ t: Date.now(), locks, trx });
    await sleep(100);
  }
  return seen;
}

/**
 * Request lanjutan berurutan setelah timeout (pelaku tetap Owner aktif): nonaktifkan Staf, lalu 4× idempoten.
 * Seharusnya semuanya 200 — dipakai untuk mendeteksi koneksi pool yang rusak setelah timeout.
 */
async function followUpRequests(s, owner, staff) {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const r = await patchActive(s, owner, staff, false);
    out.push({ status: r.status, code: r.body.code, message: r.status === 200 ? undefined : r.body.message });
  }
  return out;
}

async function scenario(s, holdMs, { lockSteps = (tx) => tx.$queryRawUnsafe(LOCK_SQL) } = {}) {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  await onlyTheseOwnersActive([owner]);
  const logOffset = s.readLog().length;
  const snapshot = await usersSnapshot();

  const holder = holdTransaction((tx) => lockSteps(tx, { staff }));
  await holder.ready;
  const started = Date.now();
  const pending = patchActive(s, owner, staff, false);
  const firstWait = (await waitForAppLockWaits(1))[0];
  await sleep(Math.max(0, holdMs - 200 - (Date.now() - started)));
  // Tepat sebelum dilepas: apakah koneksi aplikasi MASIH menunggu kunci walau Prisma sudah timeout?
  const waitsBeforeRelease = await appLockWaits();
  const trxBeforeRelease = await appOpenTransactions();
  await sleep(200);
  await holder.release();
  const final = await pending;
  const afterRelease = await watchApp(1500);
  const changed = JSON.stringify(await usersSnapshot()) !== JSON.stringify(snapshot);
  const followUps = await followUpRequests(s, owner, staff);
  const actorRow = (await rows('SELECT is_active FROM users WHERE user_id = ?', owner))[0];
  return {
    holdMs, firstWait, waitsBeforeRelease, trxBeforeRelease,
    status: final.status, ms: final.ms, message: final.body.message,
    errors: prismaErrorsIn(s.readLog().slice(logOffset)),
    afterRelease, dataChanged: changed, actorActive: actorRow.is_active === 1, followUps,
    staffActiveAfterFollowUps: await isActive(staff),
  };
}

test('G1 kunci store_settings ditahan 1,5 s (< batas lock wait 2 s) → PATCH menunggu lalu 200 setelah ±1,5 s', async () => {
  const s = await server('default');
  const result = await scenario(s, 1500);
  record(FILE, 'G1', result);
  assert.equal(result.status, 200);
  assert.ok(result.ms >= 1400 && result.ms < 2000, `ms=${result.ms}`);
  assert.deepEqual(result.afterRelease, []);
  assert.deepEqual(result.followUps.map((f) => f.status), [200, 200, 200, 200, 200]);
});

const ALL_OK = [200, 200, 200, 200, 200];
const has1205 = (errors) => errors.some((e) => /Code: `1205`/.test(e.text ?? ''));

test('G2 kunci store_settings ditahan 7 s (> timeout 5 s) → lock wait berakhir 1205 (±2 s) SEBELUM timeout Prisma; data & kunci bersih; request lanjutan benar', async () => {
  const s = await server('default-2');
  const result = await scenario(s, 7000);
  record(FILE, 'G2', result);
  assert.equal(result.firstWait.waiting_table, 'store_settings');
  assert.equal(result.status, 500);
  assert.ok(result.ms >= 1900 && result.ms < 5000, `lock wait berakhir sebelum timeout Prisma 5 s (ms=${result.ms})`);
  assert.ok(has1205(result.errors), 'MySQL 1205 Lock wait timeout exceeded');
  assert.ok(!result.errors.some((e) => ['P2028', 'P1017', 'P1001'].includes(e.code)), JSON.stringify(result.errors));
  assert.deepEqual(result.trxBeforeRelease, [], 'transaksi aplikasi sudah selesai (rollback) sebelum kunci dilepas');
  assert.equal(result.dataChanged, false, 'tidak ada perubahan setelah error');
  assert.deepEqual(result.afterRelease, [], 'tidak ada kunci/transaksi zombie setelah pemegang dilepas');
  assert.deepEqual(result.followUps.map((f) => f.status), ALL_OK, `request lanjutan — ${JSON.stringify(result.followUps)}`);
  assert.equal(result.staffActiveAfterFollowUps, false);
});

test('G3 kunci S baris Staf ditahan 7 s (meniru AD-04) → PATCH menunggu di baris target, 1205 (±2 s); tanpa UPDATE, store_settings tidak tertahan', async () => {
  const s = await server('default-3');
  const result = await scenario(s, 7000, {
    lockSteps: (tx, { staff }) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR SHARE', staff),
  });
  record(FILE, 'G3', result);
  assert.equal(result.firstWait.waiting_table, 'users', 'F-1: PATCH menunggu di baris target (sebelum store_settings)');
  assert.equal(result.status, 500);
  assert.ok(result.ms >= 1900 && result.ms < 5000, `ms=${result.ms}`);
  assert.ok(has1205(result.errors));
  assert.ok(!result.errors.some((e) => ['P2028', 'P1017', 'P1001'].includes(e.code)), JSON.stringify(result.errors));
  assert.deepEqual(result.trxBeforeRelease, []);
  assert.equal(result.dataChanged, false);
  assert.deepEqual(result.afterRelease, []);
  assert.deepEqual(result.followUps.map((f) => f.status), ALL_OK, `request lanjutan — ${JSON.stringify(result.followUps)}`);
});

/** Nilai innodb_lock_wait_timeout per koneksi aplikasi (performance_schema.variables_by_thread) */
const appSessionLockWait = () => rows(`SELECT t.PROCESSLIST_ID AS conn, v.VARIABLE_VALUE AS value
  FROM performance_schema.variables_by_thread v JOIN performance_schema.threads t ON t.THREAD_ID = v.THREAD_ID
  WHERE v.VARIABLE_NAME = 'innodb_lock_wait_timeout' AND t.PROCESSLIST_USER = 'c4app' ORDER BY conn`);

test('G4 kebijakan per koneksi pool: global MySQL tetap 50 s; setiap transaksi memasang 2 s lalu memulihkan nilai sesi di koneksi mana pun; 1205 dapat dipulihkan', async () => {
  const s = await server('pool-policy');
  const owner = await createUser('owner');
  await onlyTheseOwnersActive([owner]);
  const staffs = [];
  for (let i = 0; i < 12; i += 1) staffs.push(await createUser('staf'));
  const customers = [];
  for (let i = 0; i < 6; i += 1) customers.push(await createUser('customer'));

  // Beban bersamaan agar banyak koneksi pool (bawaan 9 di 4 CPU) menjalankan transaksi
  await startGeneralLog();
  const results = await Promise.all([...staffs.map((st) => patchActive(s, owner, st, false)), ...customers.map((c) => checkout(s, c))]);
  const log = await stopGeneralLog();
  const perConnection = await appSessionLockWait();
  const [{ global }] = await rows('SELECT @@GLOBAL.innodb_lock_wait_timeout AS global');

  const byThread = new Map();
  log.forEach((l) => byThread.set(l.thread_id, [...(byThread.get(l.thread_id) ?? []), l.sql_text.replace(/\s+/g, ' ').trim()]));
  const txThreads = [...byThread.entries()].filter(([, q]) => q.some((x) => /^BEGIN/i.test(x)));
  const SAVE = 'SET @ovc_saved_lock_wait = COALESCE(@ovc_saved_lock_wait, @@SESSION.innodb_lock_wait_timeout)';
  const beginsWithoutSet = txThreads.flatMap(([thread, q]) => q.map((x, i) => (/^BEGIN/i.test(x)
    && (!/^SELECT \d+ AS nonce, CONNECTION_ID\(\) AS conn$/.test(q[i + 1]) || q[i + 2] !== SAVE || q[i + 3] !== 'SET SESSION innodb_lock_wait_timeout = 2') ? `${thread}:${q[i + 1]}` : null)).filter(Boolean));
  const endsWithoutRestore = txThreads.flatMap(([thread, q]) => q.map((x, i) => (/^(COMMIT|ROLLBACK)/i.test(x)
    && (q[i - 2] !== 'SET SESSION innodb_lock_wait_timeout = @ovc_saved_lock_wait' || q[i - 1] !== 'SET @ovc_saved_lock_wait = NULL') ? `${thread}:${q[i - 1]}` : null)).filter(Boolean));
  const recovery = await scenario(s, 4000);
  record(FILE, 'G4', {
    statuses: results.map((r) => r.status), global, perConnection, txThreadCount: txThreads.length,
    beginCount: txThreads.reduce((n, [, q]) => n + q.filter((x) => /^BEGIN/i.test(x)).length, 0), beginsWithoutSet, endsWithoutRestore, recovery,
  });
  assert.ok(results.every((r) => [200, 201].includes(r.status)), JSON.stringify(results.map((r) => r.status)));
  assert.equal(Number(global), 50, 'konfigurasi global MySQL tidak diubah');
  assert.ok(txThreads.length >= 2, `beberapa koneksi pool menjalankan transaksi (${txThreads.length})`);
  assert.deepEqual(beginsWithoutSet, [], 'SETIAP BEGIN langsung diikuti probe nonce, lalu simpan nilai sesi + SET 2');
  assert.deepEqual(endsWithoutRestore, [], 'SETIAP COMMIT/ROLLBACK didahului pemulihan nilai sesi');
  const txConnIds = new Set(txThreads.map(([thread]) => thread));
  assert.ok(perConnection.filter((c) => txConnIds.has(c.conn)).every((c) => c.value === String(global)),
    `setelah transaksi, koneksi kembali ke nilai awal (= global untuk koneksi baru) — ${JSON.stringify(perConnection)}`);
  assert.ok(recovery.ms >= 1900 && recovery.ms < 5000, `ms=${recovery.ms}`);
  assert.ok(has1205(recovery.errors));
  assert.equal(recovery.dataChanged, false);
  assert.deepEqual(recovery.afterRelease, []);
  assert.deepEqual(recovery.followUps.map((f) => f.status), ALL_OK, 'error 1205 tidak merusak koneksi');
});

test('G5 pool transaksi (4) penuh oleh checkout yang antre kunci 12 s → semua berakhir bersih (1205 / maxWait), auth tetap cepat lewat pool utama; koneksi sehat', async () => {
  const s = await server('pool-tx-full');
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  await onlyTheseOwnersActive([owner]);
  const customers = [];
  for (let i = 0; i < 4; i += 1) customers.push(await createUser('customer'));
  const logOffset = s.readLog().length;

  const holder = holdTransaction((tx) => tx.$queryRawUnsafe(LOCK_SQL));
  await holder.ready;
  const checkouts = customers.map((c) => checkout(s, c));
  await waitForAppLockWaits(4); // keempat koneksi pool transaksi menunggu store_settings
  const authWhileFull = await call(s, 'GET', '/api/admin/staff', { userId: owner }); // auth + query biasa → pool utama
  const patch = patchActive(s, owner, staff, false); // transaksi ke-5: antre koneksi pool transaksi
  const [patchRes, ...coRes] = await Promise.all([patch, ...checkouts]); // semuanya selesai SELAGI kunci masih ditahan
  const trxWhileHeld = await appOpenTransactions();
  await sleep(Math.max(0, 12000 - patchRes.ms));
  await holder.release();
  const afterRelease = await watchApp(1500);
  const orders = (await rows(`SELECT COUNT(*) AS n FROM orders WHERE user_id IN (${customers.join(',')})`))[0].n;
  const followUps = await followUpRequests(s, owner, staff);
  const errors = prismaErrorsIn(s.readLog().slice(logOffset));
  const result = {
    authWhileFull: { status: authWhileFull.status, ms: authWhileFull.ms },
    patch: { status: patchRes.status, ms: patchRes.ms }, checkouts: coRes.map((r) => ({ status: r.status, ms: r.ms })),
    errorCodes: errors.filter((e) => e.code), lockWaitTimeouts: errors.filter((e) => /1205/.test(e.text ?? '')).length,
    unableToStart: errors.filter((e) => /Unable to start a transaction/.test(e.text ?? '')).length,
    trxWhileHeld, afterRelease, ordersCreated: Number(orders), staffActive: await isActive(staff), followUps,
  };
  record(FILE, 'G5', result);
  assert.equal(authWhileFull.status, 200);
  assert.ok(authWhileFull.ms < 1000, `auth tidak menunggu pool transaksi (ms=${authWhileFull.ms})`);
  assert.deepEqual([patchRes, ...coRes].map((r) => r.status), [500, 500, 500, 500, 500]);
  assert.ok([patchRes, ...coRes].every((r) => r.ms < 9000), 'semua berakhir jauh sebelum pool_timeout 10 s / timeout 15 s');
  assert.ok(!result.errorCodes.some((e) => ['P2024', 'P1017', 'P1001'].includes(e.code)), JSON.stringify(result.errorCodes));
  assert.ok(!errors.some((e) => /expired transaction/.test(e.text ?? '')), 'tidak ada P2028 karena transaksi kedaluwarsa');
  assert.equal(result.lockWaitTimeouts + result.unableToStart, 5, 'setiap kegagalan = 1205 atau maxWait (tidak ada sebab lain)');
  assert.deepEqual(trxWhileHeld, [], 'tidak ada transaksi aplikasi yang tetap menunggu');
  assert.equal(result.ordersCreated, 0, 'checkout yang gagal tidak meninggalkan pesanan');
  assert.deepEqual(afterRelease, []);
  assert.deepEqual(followUps.map((f) => f.status), ALL_OK, `request lanjutan — ${JSON.stringify(followUps)}`);
});

// maxWait berlaku saat $transaction MENUNGGU KONEKSI untuk BEGIN; timeout = umur transaksi, diperiksa saat query berikutnya.
// Diukur langsung dengan Prisma Client (pool 1 koneksi, tanpa wrapper aplikasi) agar keduanya terpisah dari lock wait.
test('G6 maxWait (2 s) & timeout (5 s) diukur terpisah — Prisma langsung, pool 1 koneksi; timeout tanpa query yang antre tidak merusak koneksi', async () => {
  const { PrismaClient } = require('@prisma/client');
  const url = new URL(process.env.ROOT_DATABASE_URL);
  url.searchParams.set('connection_limit', '1');
  const single = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const brief = (e) => ({ code: e.code, message: String(e.message).split('\n').filter(Boolean).at(-1).slice(0, 160) });
  try {
    let release;
    const gate = new Promise((r) => { release = r; });
    const busy = single.$transaction(async (tx) => { await tx.$queryRawUnsafe('SELECT 1'); await gate; }, { timeout: 10000 });
    await sleep(200);
    let started = Date.now();
    const maxWait = await single.$transaction(async (tx) => tx.$queryRawUnsafe('SELECT 1')).then(() => ({ ok: true }), brief);
    const maxWaitMs = Date.now() - started;
    release();
    await busy;

    started = Date.now();
    const timeout = await single.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT 1');
      await sleep(5500); // kerja di luar database melewati timeout 5 s — tidak ada pernyataan yang sedang antre
      return tx.$queryRawUnsafe('SELECT 1');
    }).then(() => ({ ok: true }), brief);
    const timeoutMs = Date.now() - started;
    const next = await single.user.findUnique({ where: { userId: 1n }, select: { userId: true } }).then((r) => r && String(r.userId), brief);
    record(FILE, 'G6', { maxWait, maxWaitMs, timeout, timeoutMs, nextQueryAfterTimeout: next });
    assert.equal(maxWait.code, 'P2028');
    assert.match(maxWait.message, /Unable to start a transaction in the given time/);
    assert.ok(maxWaitMs >= 1900 && maxWaitMs < 3000, `maxWait ms=${maxWaitMs}`);
    assert.equal(timeout.code, 'P2028');
    assert.match(timeout.message, /expired transaction|timeout/i);
    assert.ok(timeoutMs >= 5400 && timeoutMs < 7000, `timeout ms=${timeoutMs}`);
    assert.equal(next, '1', 'koneksi tetap benar setelah timeout tanpa query yang antre');
  } finally {
    await single.$disconnect();
  }
});
