// tests-mysql/helpers/context.js
// Integrasi MySQL 8 — Validasi AD-11 (C3), dengan smoke test C2. Konteks bersama uji integrasi (BUKAN unit test).
// - Penjaga database: hanya mau berjalan terhadap database uji sementara (nama berakhiran `_test`, host lokal, port
//   bukan 3306) dan hanya bila C4_MYSQL_IT=1 — database utama tidak pernah disentuh.
// - Dua akun MySQL: server aplikasi memakai APP_DATABASE_URL (akun `c4app`, hak hanya pada database uji) sehingga
//   query aplikasi bisa dipisahkan dari query harness di general_log / performance_schema; harness memakai
//   ROOT_DATABASE_URL (pemegang kunci, metrik, setup data).
// - Database TIDAK di-reset di antara file (tanpa `migrate reset`): run.sh membuat container baru + migrasi + seed
//   sekali per run, dan setiap skenario membuat akun/pesanannya sendiri (email unik).
// - Artefak (log server, log MySQL, hasil JSON) ditulis ke C4_ARTIFACT_DIR (default /tmp/c4), tidak ke repository.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const ARTIFACT_DIR = process.env.C4_ARTIFACT_DIR || '/tmp/c4';
const CONTAINER = process.env.C4_MYSQL_CONTAINER || 'ovenco-c4-mysql';
const APP_DB_USER = 'c4app';

function assertTestDatabase(url, label) {
  if (process.env.C4_MYSQL_IT !== '1') throw new Error('Uji integrasi MySQL hanya lewat `npm run test:mysql` (C4_MYSQL_IT=1).');
  if (!url) throw new Error(`${label} belum diisi.`);
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error(`${label}: host harus lokal.`);
  if (!parsed.port || parsed.port === '3306') throw new Error(`${label}: port 3306 ditolak (hindari database utama).`);
  if (!/_test$/.test(database)) throw new Error(`${label}: nama database harus berakhiran _test.`);
  return { database, parsed };
}

const ROOT_URL = process.env.ROOT_DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;
const { database: DATABASE } = assertTestDatabase(ROOT_URL, 'ROOT_DATABASE_URL');
assertTestDatabase(APP_URL, 'APP_DATABASE_URL');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

// Harness (akun root database uji): pool cukup besar untuk banyak pemegang kunci + query metrik sekaligus
const harnessUrl = new URL(ROOT_URL);
harnessUrl.searchParams.set('connection_limit', '40'); // cukup untuk I5 (12 pemegang kunci + query metrik); HANYA harness uji
const db = new PrismaClient({ datasources: { db: { url: harnessUrl.toString() } } });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ubah BigInt → string agar hasil query bisa dibandingkan/diserialkan */
function plain(value) {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

async function rows(sql, ...params) {
  return plain(await db.$queryRawUnsafe(sql, ...params));
}

/**
 * Pegang transaksi terbuka dengan pernyataan tertentu (meniru urutan kunci transaksi aplikasi) sampai release().
 * @param {(tx) => Promise<void>} lockSteps — dijalankan di dalam transaksi (koneksi harness)
 * @returns {{ready: Promise<void>, release: (beforeCommit?) => Promise<any>, done: Promise<any>}}
 */
function holdTransaction(lockSteps, { timeout = 120000 } = {}) {
  let markReady;
  let markError;
  let releaseGate;
  const ready = new Promise((resolve, reject) => { markReady = resolve; markError = reject; });
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  const done = db.$transaction(async (tx) => {
    const id = await tx.$queryRaw`SELECT CONNECTION_ID() AS id`;
    await lockSteps(tx);
    markReady(String(id[0].id));
    const beforeCommit = await gate;
    if (beforeCommit) return beforeCommit(tx);
    return null;
  }, { maxWait: 10000, timeout });
  done.catch(markError);
  return { ready, done, release: (beforeCommit) => { releaseGate(beforeCommit); return done; } };
}

/** Tunggu sampai ada koneksi aplikasi (c4app) yang sedang MENUNGGU kunci baris (performance_schema) */
async function waitForAppLockWaits(count = 1, { timeoutMs = 10000 } = {}) {
  const started = Date.now();
  for (;;) {
    const waits = await appLockWaits();
    if (waits.length >= count) return waits;
    if (Date.now() - started > timeoutMs) throw new Error(`Tidak ada ${count} lock wait aplikasi dalam ${timeoutMs} ms`);
    await sleep(25);
  }
}

/** Tunggu sampai ada lock wait aplikasi yang memenuhi predikat (mis. tabel & baris tertentu) */
async function waitForAppLockWait(predicate, { timeoutMs = 15000 } = {}) {
  const started = Date.now();
  for (;;) {
    const waits = await appLockWaits();
    if (waits.some(predicate)) return waits;
    if (Date.now() - started > timeoutMs) throw new Error(`Lock wait yang dicari tidak muncul dalam ${timeoutMs} ms: ${JSON.stringify(waits)}`);
    await sleep(25);
  }
}

/** Kunci yang sedang ditunggu koneksi aplikasi: tabel, indeks, mode, data kunci, dan pemegangnya */
async function appLockWaits() {
  return rows(`
    SELECT rl.OBJECT_NAME AS waiting_table, rl.INDEX_NAME AS waiting_index, rl.LOCK_MODE AS waiting_mode,
           rl.LOCK_DATA AS waiting_data, wt.PROCESSLIST_ID AS waiting_conn, wt.PROCESSLIST_USER AS waiting_user,
           bl.LOCK_MODE AS blocking_mode, bt.PROCESSLIST_ID AS blocking_conn, bt.PROCESSLIST_USER AS blocking_user
    FROM performance_schema.data_lock_waits w
    JOIN performance_schema.data_locks rl ON rl.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
    JOIN performance_schema.data_locks bl ON bl.ENGINE_LOCK_ID = w.BLOCKING_ENGINE_LOCK_ID
    JOIN performance_schema.threads wt ON wt.THREAD_ID = w.REQUESTING_THREAD_ID
    JOIN performance_schema.threads bt ON bt.THREAD_ID = w.BLOCKING_THREAD_ID
    WHERE wt.PROCESSLIST_USER = ?`, APP_DB_USER);
}

/** Semua kunci (record/table) yang masih dipegang transaksi InnoDB koneksi aplikasi */
async function appHeldLocks() {
  return rows(`
    SELECT l.OBJECT_NAME AS table_name, l.INDEX_NAME AS index_name, l.LOCK_TYPE AS lock_type, l.LOCK_MODE AS lock_mode,
           l.LOCK_STATUS AS lock_status, l.LOCK_DATA AS lock_data, t.PROCESSLIST_ID AS conn
    FROM performance_schema.data_locks l JOIN performance_schema.threads t ON t.THREAD_ID = l.THREAD_ID
    WHERE t.PROCESSLIST_USER = ? AND l.OBJECT_SCHEMA = ?`, APP_DB_USER, DATABASE);
}

/** Transaksi InnoDB yang masih terbuka milik koneksi aplikasi */
async function appOpenTransactions() {
  return rows(`
    SELECT trx.trx_id, trx.trx_state, trx.trx_mysql_thread_id AS conn, trx.trx_query
    FROM information_schema.innodb_trx trx JOIN performance_schema.threads t ON t.PROCESSLIST_ID = trx.trx_mysql_thread_id
    WHERE t.PROCESSLIST_USER = ?`, APP_DB_USER);
}

/** Metrik InnoDB (counter kumulatif sejak server MySQL start) */
async function innodbMetrics() {
  const list = await rows(`SELECT NAME AS name, COUNT AS count FROM information_schema.innodb_metrics
    WHERE NAME IN ('lock_deadlocks','lock_timeouts','lock_row_lock_waits')`);
  return Object.fromEntries(list.map((m) => [m.name, Number(m.count)]));
}

/** Bagian LATEST DETECTED DEADLOCK dari SHOW ENGINE INNODB STATUS (null bila belum pernah ada deadlock) */
async function latestDeadlockSection() {
  const [row] = await rows('SHOW ENGINE INNODB STATUS'); // Prisma memberi nama kolom f0 (Type), f1 (Name), f2 (Status)
  const status = row.Status ?? row.f2;
  const match = status.match(/LATEST DETECTED DEADLOCK\n-+\n([\s\S]*?)\n-{6,}\nTRANSACTIONS/);
  return match ? match[1] : null;
}

/** Log error MySQL (innodb_print_all_deadlocks=ON → semua deadlock tercatat di sini) sejak waktu tertentu */
function mysqlErrorLogSince(since) {
  // mysqld menulis log error ke stderr container → `docker logs` meneruskannya lewat stderr
  const result = spawnSync('docker', ['logs', '--since', since.toISOString(), CONTAINER], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`docker logs gagal: ${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function deadlockLinesIn(log) {
  // log_error_verbosity=3 (run.sh) → header "Transactions deadlock detected" & "WE ROLL BACK TRANSACTION" ikut tercetak
  return log.split('\n').filter((line) => /deadlock|WE ROLL BACK/i.test(line));
}

/** general_log ke tabel mysql.general_log (hanya selama penangkapan jejak SQL) */
async function startGeneralLog() {
  await db.$executeRawUnsafe("SET GLOBAL log_output = 'TABLE'");
  await db.$executeRawUnsafe('SET GLOBAL general_log = OFF');
  await db.$executeRawUnsafe('TRUNCATE TABLE mysql.general_log');
  await db.$executeRawUnsafe('SET GLOBAL general_log = ON');
}

/** Hentikan general_log lalu kembalikan pernyataan koneksi aplikasi (urut waktu) */
async function stopGeneralLog() {
  await db.$executeRawUnsafe('SET GLOBAL general_log = OFF');
  return rows(`SELECT thread_id, command_type, CONVERT(argument USING utf8mb4) AS sql_text
    FROM mysql.general_log WHERE user_host LIKE ? AND command_type IN ('Query','Execute') ORDER BY event_time, thread_id`,
  `${APP_DB_USER}%`);
}

/** Simpan bukti per skenario ke /tmp/c4/results/<file>.jsonl */
function record(file, scenario, data) {
  const dir = path.join(ARTIFACT_DIR, 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${file}.jsonl`), `${JSON.stringify(plain({ scenario, at: new Date().toISOString(), ...data }))}\n`);
}

module.exports = {
  ARTIFACT_DIR, CONTAINER, DATABASE, APP_DB_USER, APP_URL, db, sleep, plain, rows,
  holdTransaction, waitForAppLockWaits, waitForAppLockWait, appLockWaits, appHeldLocks, appOpenTransactions,
  innodbMetrics, latestDeadlockSection, mysqlErrorLogSince, deadlockLinesIn, startGeneralLog, stopGeneralLog, record,
};
