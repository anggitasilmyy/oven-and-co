// tests-mysql/01-staff-locking.it.test.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2 · FR-36 · UC-30 · C3c PATCH /api/admin/staff/:id/active
// Bukti perilaku InnoDB nyata: (B1) jejak SQL Prisma dari general_log — urutan F-1: SET lock wait (F-2) → kunci baris
// target → kunci store_settings → baca → UPDATE; (B2) read view REPEATABLE READ dibuat pada pembacaan biasa pertama —
// bukan saat BEGIN / locking read; (B3) PATCH sungguh menunggu kunci store_settings sambil memegang HANYA baris target
// (performance_schema.data_locks) dan pembacaan setelah kunci melihat commit selama menunggu; (B4) cabang tanpa UPDATE,
// target pelanggan/tidak ada tanpa transaksi & tanpa kunci, dan hanya is_active berubah.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  db, rows, holdTransaction, waitForAppLockWaits, appHeldLocks, startGeneralLog, stopGeneralLog, record,
} = require('./helpers/context');
const { startServer, patchActive } = require('./helpers/server');
const { createUser, onlyTheseOwnersActive, isActive, usersSnapshot } = require('./helpers/fixtures');

const FILE = '01-staff-locking';
let server;

test.before(async () => {
  server = await startServer(FILE);
});
test.after(async () => {
  await server?.stop();
  await db.$disconnect();
});

const LOCK_SQL = 'SELECT setting_id FROM store_settings ORDER BY setting_id LIMIT 1 FOR UPDATE';
const lockStoreSettings = (tx) => tx.$queryRawUnsafe(LOCK_SQL);

/** Pernyataan koneksi aplikasi yang memuat transaksi PATCH (thread yang menjalankan FOR UPDATE store_settings) */
function patchTransactionStatements(log) {
  const lockLine = log.find((l) => /store_settings[\s\S]*FOR UPDATE/i.test(l.sql_text));
  assert.ok(lockLine, 'FOR UPDATE store_settings harus muncul di general_log');
  const thread = log.filter((l) => l.thread_id === lockLine.thread_id).map((l) => l.sql_text.replace(/\s+/g, ' ').trim());
  const begin = thread.findIndex((s) => /^(BEGIN|START TRANSACTION)/i.test(s));
  const end = thread.findIndex((s, i) => i > begin && /^(COMMIT|ROLLBACK)/i.test(s));
  return thread.slice(begin, end + 1);
}

test('B1 jejak SQL Prisma: BEGIN → probe nonce → simpan & SET lock wait → FOR UPDATE baris target → FOR UPDATE store_settings → baca → UPDATE is_active → pulihkan sesi → COMMIT', async () => {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  await onlyTheseOwnersActive([owner]);

  await startGeneralLog();
  const res = await patchActive(server, owner, staff, false);
  const log = await stopGeneralLog();
  assert.equal(res.status, 200);

  const tx = patchTransactionStatements(log);
  record(FILE, 'B1', { transaction: tx, authQueries: log.filter((l) => !tx.includes(l.sql_text)).map((l) => l.sql_text) });
  assert.match(tx[0], /^BEGIN/i, 'transaksi Prisma dibuka dengan BEGIN');
  assert.match(tx[1], /^SELECT \d+ AS nonce, CONNECTION_ID\(\) AS conn$/, 'F-2: probe nonce = pernyataan pertama transaksi');
  assert.equal(tx[2], 'SET @ovc_saved_lock_wait = COALESCE(@ovc_saved_lock_wait, @@SESSION.innodb_lock_wait_timeout)', 'F-2: simpan nilai sesi');
  assert.equal(tx[3], 'SET SESSION innodb_lock_wait_timeout = 2', 'F-2: batas lock wait sebelum query callback');
  assert.equal(tx[4], `SELECT user_id FROM users WHERE user_id = ${staff} FOR UPDATE`, 'F-1: kunci baris target lebih dulu');
  assert.match(tx[5], /store_settings.*FOR UPDATE/i, 'F-1: lalu kunci store_settings, sebelum pembacaan biasa apa pun');
  assert.deepEqual(tx.slice(-3), ['SET SESSION innodb_lock_wait_timeout = @ovc_saved_lock_wait', 'SET @ovc_saved_lock_wait = NULL', 'COMMIT'],
    'F-2: nilai sesi dipulihkan sebelum COMMIT');
  assert.ok(!tx.some((s) => /SET (SESSION )?TRANSACTION ISOLATION/i.test(s)), 'Prisma tidak mengubah isolasi (REPEATABLE READ)');
  const updates = tx.filter((s) => /^UPDATE/i.test(s));
  assert.equal(updates.length, 1);
  assert.match(updates[0], /^UPDATE `[^`]+`\.`users` SET `is_active` = \S+ WHERE/i, 'UPDATE hanya kolom is_active');
});

test('B2 kontrol InnoDB: read view dibuat pada SELECT biasa pertama, bukan BEGIN / FOR UPDATE', async () => {
  const staff = await createUser('staf');
  const readAfterLock = async (plainReadFirst) => {
    await db.$executeRawUnsafe('UPDATE users SET is_active = 1 WHERE user_id = ?', staff);
    const holder = holdTransaction(lockStoreSettings);
    await holder.ready;
    const reader = db.$transaction(async (tx) => {
      const before = plainReadFirst ? (await tx.$queryRawUnsafe('SELECT is_active FROM users WHERE user_id = ?', staff))[0].is_active : null;
      await tx.$queryRawUnsafe(LOCK_SQL); // menunggu holder
      const after = (await tx.$queryRawUnsafe('SELECT is_active FROM users WHERE user_id = ?', staff))[0].is_active;
      return { before, after };
    }, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 300)); // reader sudah BEGIN dan menunggu kunci
    await holder.release((tx) => tx.$executeRawUnsafe('UPDATE users SET is_active = 0 WHERE user_id = ?', staff));
    return reader;
  };

  const lockFirst = await readAfterLock(false);
  const plainFirst = await readAfterLock(true);
  record(FILE, 'B2', { lockFirst, plainFirst });
  assert.equal(lockFirst.after, 0, 'kunci sebagai operasi pertama → baca setelah kunci melihat commit terbaru');
  assert.equal(plainFirst.before, 1);
  assert.equal(plainFirst.after, 1, 'SELECT biasa sebelum kunci → snapshot lama (alasan urutan kode C3)');
});

test('B3a PATCH menunggu kunci store_settings yang dipegang transaksi lain, lalu berhasil', async () => {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  await onlyTheseOwnersActive([owner]);

  const holder = holdTransaction(lockStoreSettings);
  const holderConn = await holder.ready;
  const pending = patchActive(server, owner, staff, false);
  const [wait] = await waitForAppLockWaits(1);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await isActive(staff), true, 'belum berubah selama menunggu');
  // performance_schema.data_locks: yang dipegang koneksi PATCH selagi menunggu store_settings
  const patchLocks = (await appHeldLocks()).filter((l) => String(l.conn) === String(wait.waiting_conn));
  await holder.release();
  const res = await pending;
  record(FILE, 'B3a', { wait, holderConn, patchLocks, status: res.status, ms: res.ms });
  const rowLocks = patchLocks.filter((l) => l.lock_type === 'RECORD');
  assert.deepEqual(rowLocks.filter((l) => l.table_name === 'users').map((l) => [l.lock_mode, l.lock_status, l.lock_data]),
    [['X,REC_NOT_GAP', 'GRANTED', staff]], 'hanya baris target yang dikunci (X), sudah diberikan');
  assert.deepEqual(rowLocks.filter((l) => l.table_name === 'store_settings').map((l) => l.lock_status), ['WAITING']);
  assert.equal(wait.waiting_table, 'store_settings');
  assert.match(wait.waiting_mode, /^X/, 'kunci eksklusif (next-key X karena ORDER BY … LIMIT 1 = scan indeks PRIMARY)');
  assert.equal(String(wait.blocking_conn), holderConn);
  assert.equal(res.status, 200);
  assert.ok(res.ms >= 500);
  assert.equal(await isActive(staff), false);
  assert.deepEqual(await appHeldLocks(), [], 'tidak ada kunci aplikasi tersisa');
});

test('B3b pelaku dinonaktifkan selagi menunggu kunci → 401 SESSION_INVALID tanpa efek (data dibaca setelah kunci)', async () => {
  const ownerA = await createUser('owner');
  const ownerB = await createUser('owner');
  const staff = await createUser('staf');
  await onlyTheseOwnersActive([ownerA, ownerB]);

  const holder = holdTransaction(lockStoreSettings);
  await holder.ready;
  const pending = patchActive(server, ownerA, staff, false); // lolos middleware auth (A masih aktif)
  const [wait] = await waitForAppLockWaits(1);
  await holder.release((tx) => tx.$executeRawUnsafe('UPDATE users SET is_active = 0 WHERE user_id = ?', ownerA));
  const res = await pending;
  record(FILE, 'B3b', { wait, status: res.status, body: res.body });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'SESSION_INVALID');
  assert.equal(await isActive(staff), true, 'target tidak berubah');
});

test('B4 cabang tanpa UPDATE (akun sendiri, pelanggan, id tidak ada/tidak sah, idempoten) & hanya is_active berubah', async () => {
  const owner = await createUser('owner');
  const staff = await createUser('staf');
  const inactiveStaff = await createUser('staf', { active: false });
  const customer = await createUser('customer');
  await onlyTheseOwnersActive([owner]);

  // Target pelanggan / tidak ada saat store_settings dipegang transaksi lain → 404 SEGERA (tanpa transaksi & kunci)
  const holder = holdTransaction(lockStoreSettings);
  await holder.ready;
  const quick = [await patchActive(server, owner, customer, false), await patchActive(server, owner, '999999999', true)];
  const locksDuringHold = await appHeldLocks();
  await holder.release();
  record(FILE, 'B4-no-lock', { quick: quick.map((r) => [r.status, r.ms]), locksDuringHold });
  assert.deepEqual(quick.map((r) => r.status), [404, 404]);
  assert.ok(quick.every((r) => r.ms < 1000), 'tidak menunggu kunci store_settings');
  assert.deepEqual(locksDuringHold, [], 'tidak ada kunci aplikasi (baris pelanggan tidak dikunci)');

  const before = await usersSnapshot();
  await startGeneralLog();
  const results = {
    self: await patchActive(server, owner, owner, false),
    customer: await patchActive(server, owner, customer, false),
    missing: await patchActive(server, owner, '999999999', false),
    invalid: await patchActive(server, owner, 'abc', false),
    idempotent: await patchActive(server, owner, inactiveStaff, false),
  };
  const log = await stopGeneralLog();
  assert.deepEqual(await usersSnapshot(), before, 'tanpa perubahan apa pun');
  const updates = log.filter((l) => /^\s*UPDATE/i.test(l.sql_text));
  const userRowLocks = log.map((l) => l.sql_text).filter((q) => /FROM users WHERE user_id = \d+ FOR UPDATE/i.test(q));
  record(FILE, 'B4-noop', { statuses: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, [v.status, v.body.code ?? v.body.message]])), updates, userRowLocks });
  assert.deepEqual(userRowLocks.sort(), [owner, inactiveStaff].map((id) => `SELECT user_id FROM users WHERE user_id = ${id} FOR UPDATE`).sort(),
    'hanya akun admin (diri sendiri & Staf idempoten) yang dikunci; pelanggan & id tidak ada tidak pernah');
  assert.equal(results.self.status, 400);
  assert.equal(results.customer.status, 404);
  assert.equal(results.missing.status, 404);
  assert.equal(results.invalid.status, 400);
  assert.equal(results.invalid.body.code, 'INVALID_ID');
  assert.equal(results.idempotent.status, 200);
  assert.equal(results.idempotent.body.data.is_active, false);
  assert.equal(updates.length, 0, 'tidak ada UPDATE di database');

  const res = await patchActive(server, owner, staff, false);
  assert.equal(res.status, 200);
  const after = await usersSnapshot();
  const changed = after.flatMap((row, i) => Object.keys(row)
    .filter((col) => JSON.stringify(row[col]) !== JSON.stringify(before[i][col]))
    .map((col) => `${row.user_id}.${col}`));
  record(FILE, 'B4-diff', { changed });
  assert.deepEqual(changed, [`${staff}.is_active`]);
  const rowsAfter = await rows('SELECT is_active FROM users WHERE user_id = ?', staff);
  assert.equal(rowsAfter[0].is_active, 0);
});
