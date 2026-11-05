// tests-mysql/07-session-lock-wait.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3) · revisi F-2: variabel SESSION innodb_lock_wait_timeout tidak boleh bocor ke
// pemakaian koneksi berikutnya. Klien Prisma ASLI dengan wrapper aplikasi (src/lib/transactionLockWait.js), pool SATU
// koneksi (connection_limit=1) — setiap langkah memeriksa CONNECTION_ID() sehingga penggunaan ulang koneksi terbukti.
// Nilai awal sesi sengaja dibuat 7 (bukan bawaan 50) agar tidak ada asumsi "selalu 50".
// H1 commit · H2 rollback · H3 error 1205 · H4 exception callback · H5 timeout Prisma (P2028) · H6 query non-interaktif
// setelah transaksi menunggu row lock 3 s · H7 beberapa lock wait berturut-turut vs timeout Prisma 5 s (keterbatasan).

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { applyTransactionLockWaitTimeout } = require('../src/lib/transactionLockWait');
const { APP_URL, db, holdTransaction, waitForAppLockWait, sleep, record } = require('./helpers/context');
const { createUser } = require('./helpers/fixtures');

const FILE = '07-session-lock-wait';
const INITIAL = '7';
let client;
let conn;

const brief = (e) => ({
  code: e?.code, message: String(e?.message ?? e).split('\n').filter(Boolean).at(-1).slice(0, 160),
  restoreError: e?.sessionRestoreError ? String(e.sessionRestoreError.message).split('\n').filter(Boolean).at(-1).slice(0, 120) : undefined,
});

/** Keadaan sesi koneksi tunggal (query non-interaktif → koneksi yang sama di pool 1) */
async function session(source = client) {
  const [r] = await source.$queryRawUnsafe('SELECT CONNECTION_ID() AS conn, CAST(@@SESSION.innodb_lock_wait_timeout AS CHAR) AS value, CAST(@ovc_saved_lock_wait AS CHAR) AS saved');
  return { conn: String(r.conn), value: r.value, saved: r.saved };
}

/** Kunci baris users dari koneksi harness lain; lepas `holdMs` setelah koneksi aplikasi mulai menunggunya */
function rowLockReleasedAfterWait(userId, holdMs) {
  const holder = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', userId));
  const released = holder.ready
    .then(() => waitForAppLockWait((w) => w.waiting_table === 'users' && w.waiting_data === String(userId), { timeoutMs: 20000 }))
    .then(() => sleep(holdMs))
    .then(() => holder.release());
  return { ready: holder.ready, released, holder };
}

test.before(async () => {
  const url = new URL(APP_URL);
  url.searchParams.set('connection_limit', '1');
  client = applyTransactionLockWaitTimeout(new PrismaClient({ datasources: { db: { url: url.toString() } } }));
  await client.$executeRawUnsafe(`SET SESSION innodb_lock_wait_timeout = ${INITIAL}`);
  ({ conn } = await session());
});
test.after(async () => { await client?.$disconnect(); await db.$disconnect(); });

test('H1 commit: 2 selama transaksi, kembali ke nilai awal (7) setelah commit di koneksi yang sama', async () => {
  const before = await session();
  const inside = await client.$transaction((tx) => session(tx));
  const after = await session();
  record(FILE, 'H1', { before, inside, after });
  assert.deepEqual(before, { conn, value: INITIAL, saved: null });
  assert.deepEqual(inside, { conn, value: '2', saved: INITIAL }, 'nilai 2 & nilai awal tersimpan selama transaksi');
  assert.deepEqual(after, { conn, value: INITIAL, saved: null });
});

test('H2 rollback (callback gagal setelah menulis): error asli diteruskan, tulisan dibatalkan, sesi pulih', async () => {
  const staff = await createUser('staf');
  const failure = new Error('gagal bisnis setelah UPDATE');
  const outcome = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("UPDATE users SET name = 'C4 rollback' WHERE user_id = ?", staff);
    throw failure;
  }).then(() => 'ok', (e) => e);
  const after = await session();
  const [row] = await db.$queryRawUnsafe('SELECT name FROM users WHERE user_id = ?', staff);
  record(FILE, 'H2', { error: brief(outcome), after, name: row.name });
  assert.equal(outcome, failure, 'error utama tidak tertutup error pemulihan');
  assert.equal(outcome.sessionRestoreError, undefined);
  assert.notEqual(row.name, 'C4 rollback');
  assert.deepEqual(after, { conn, value: INITIAL, saved: null });
});

test('H3 error 1205 (row lock ditahan 4 s): gagal ±2 s, error 1205 diteruskan, sesi pulih, koneksi sama & sehat', async () => {
  const staff = await createUser('staf');
  const holder = holdTransaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', staff));
  await holder.ready;
  const started = Date.now();
  const outcome = await client.$transaction((tx) => tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', staff))
    .then(() => 'ok', (e) => e);
  const ms = Date.now() - started;
  const after = await session();
  await holder.release();
  const next = await client.user.findUnique({ where: { userId: BigInt(staff) }, select: { userId: true } });
  record(FILE, 'H3', { error: brief(outcome), ms, after, next: next && String(next.userId) });
  assert.match(String(outcome.message), /Code: `1205`/);
  assert.equal(outcome.sessionRestoreError, undefined);
  assert.ok(ms >= 1900 && ms < 3500, `ms=${ms}`);
  assert.deepEqual(after, { conn, value: INITIAL, saved: null });
  assert.equal(next && String(next.userId), staff, 'query berikutnya di koneksi yang sama benar');
});

test('H4 exception dari callback (sebelum query apa pun): exception asli diteruskan, sesi pulih', async () => {
  const bug = new TypeError('bug di callback');
  const outcome = await client.$transaction(async () => { throw bug; }).then(() => 'ok', (e) => e);
  const after = await session();
  record(FILE, 'H4', { error: brief(outcome), after });
  assert.equal(outcome, bug);
  assert.deepEqual(after, { conn, value: INITIAL, saved: null });
});

test('H5 KETERBATASAN timeout Prisma (P2028): pemulihan tidak dapat dijalankan → nilai 2 tertinggal di koneksi sampai transaksi berikutnya memulihkannya', async () => {
  const started = Date.now();
  const outcome = await client.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT 1');
    await sleep(5500);
    return tx.$queryRawUnsafe('SELECT 1');
  }).then(() => 'ok', (e) => e);
  const ms = Date.now() - started;
  const leaked = await session();
  await client.$transaction((tx) => tx.$queryRawUnsafe('SELECT 1'));
  const healed = await session();
  record(FILE, 'H5', { error: brief(outcome), ms, leaked, healed });
  assert.equal(outcome.code, 'P2028', 'error utama P2028 diteruskan (bukan error pemulihan)');
  assert.ok(outcome.sessionRestoreError, 'pemulihan memang ditolak Prisma (transaksi sudah ditutup)');
  assert.equal(leaked.conn, conn, 'koneksi yang sama dipakai ulang (Prisma tidak me-reset koneksi)');
  assert.deepEqual(leaked, { conn, value: '2', saved: INITIAL }, 'nilai 2 tertinggal; nilai asli masih di penanda');
  assert.deepEqual(healed, { conn, value: INITIAL, saved: null }, 'transaksi interaktif berikutnya memulihkan nilai ASLI (bukan 2)');
});

test('H6 setelah transaksi, query non-interaktif di koneksi yang sama menunggu row lock 3 s lalu BERHASIL (bukan 1205 di detik ke-2)', async () => {
  const staff = await createUser('staf');
  await client.$transaction((tx) => tx.$queryRawUnsafe('SELECT 1'));
  const beforeQuery = await session();
  const lock = rowLockReleasedAfterWait(staff, 3000);
  await lock.ready;
  const started = Date.now();
  const outcome = await client.$executeRawUnsafe("UPDATE users SET name = 'C4 non-tx' WHERE user_id = ?", staff)
    .then((count) => ({ count }), brief);
  const ms = Date.now() - started;
  await lock.released;
  const after = await session();
  record(FILE, 'H6', { beforeQuery, outcome, ms, after });
  assert.deepEqual(beforeQuery, { conn, value: INITIAL, saved: null });
  assert.deepEqual(outcome, { count: 1 });
  assert.ok(ms >= 2900, `menunggu sampai kunci dilepas (ms=${ms})`);
  assert.equal(after.conn, conn);
});

// Tugas 4: tiap pernyataan dibatasi 2 s, tetapi beberapa lock wait yang masing-masing BERHASIL tepat sebelum 2 s bisa
// menjumlah melewati timeout Prisma 5 s. Dua wait ±1,8 s = ±3,6 s (aman); tiga wait ±1,8 s = ±5,4 s → pernyataan ketiga
// masih antre saat timeout Prisma lewat — perilaku Prisma 6.19.3 setelahnya dicatat apa adanya.
test('H7 KETERBATASAN beberapa lock wait berturut-turut: 2 × ±1,8 s aman; 3 × ±1,8 s melewati timeout Prisma 5 s', async () => {
  const outcomes = {};
  for (const waits of [2, 3]) {
    const rowsToLock = [];
    for (let i = 0; i < waits; i += 1) rowsToLock.push(await createUser('staf'));
    const locks = [];
    const started = Date.now();
    const pending = client.$transaction(async (tx) => {
      for (const id of rowsToLock) {
        const lock = rowLockReleasedAfterWait(id, 1800);
        locks.push(lock);
        await lock.ready;
        await tx.$queryRawUnsafe('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', id);
      }
      return 'ok';
    }).then((v) => ({ result: v }), brief);
    const outcome = await pending;
    const ms = Date.now() - started;
    await Promise.allSettled(locks.map((l) => l.released));
    const next = await client.user.findUnique({ where: { userId: BigInt(rowsToLock[0]) }, select: { userId: true } })
      .then((r) => (r ? String(r.userId) : null), (e) => brief(e));
    const nextAgain = await client.user.findUnique({ where: { userId: BigInt(rowsToLock[0]) }, select: { userId: true } })
      .then((r) => (r ? String(r.userId) : null), (e) => brief(e));
    outcomes[waits] = { outcome, ms, expected: rowsToLock[0], next, nextAgain, sessionAfter: await session().catch(brief) };
  }
  record(FILE, 'H7', outcomes);
  assert.deepEqual(outcomes[2].outcome, { result: 'ok' }, 'dua wait berturut-turut selesai di bawah 5 s');
  assert.ok(outcomes[2].ms < 5000, `ms=${outcomes[2].ms}`);
  assert.equal(outcomes[2].next, outcomes[2].expected, 'koneksi sehat setelah dua wait');
  assert.ok(outcomes[3].ms >= 5000, `ms=${outcomes[3].ms}`);
  assert.equal(outcomes[3].outcome.code, 'P2028', 'tiga wait berturut-turut melewati timeout Prisma (keterbatasan)');
});
