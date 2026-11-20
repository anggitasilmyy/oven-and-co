// tests-mysql/helpers/scratchDb.js
// CR-04a CP2 — database sementara tambahan di container MySQL uji yang SAMA (port 33306, akun root uji) untuk skenario
// migrasi/seed yang butuh database sendiri (upgrade, instalasi baru, seed berulang, K-D, gangguan). Nama database
// selalu `ovenco_cp2_*_test` dan hanya dibuat/dihapus di container uji; database utama tidak pernah disentuh.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { CONTAINER, ARTIFACT_DIR, plain } = require('./context');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const ROOT = new URL(process.env.ROOT_DATABASE_URL);
const ROOT_PASSWORD = decodeURIComponent(ROOT.password);
const PRE_CR04A = ['20261017000000_init', '20261111000000_cr03_product_materials'];
// CR-04b: database "sesudah CR-04a, sebelum CR-04b" (39 tabel) untuk uji langkah migrasi tertentu
const UP_TO_CR04A = [...PRE_CR04A, '20261112000000_cr04a_purchasing'];

function assertScratchName(name) {
  if (!/^ovenco_cp2_[a-z0-9_]+_test$/.test(name)) throw new Error(`Nama database sementara tidak sah: ${name}`);
}

function urlFor(name) {
  assertScratchName(name);
  const url = new URL(ROOT);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Jalankan SQL lewat klien mysql di container uji → stdout (tab-separated, tanpa header) */
function mysql(sql, database = '') {
  const args = ['exec', '-i', CONTAINER, 'mysql', '-uroot', `-p${ROOT_PASSWORD}`, '-N', '-B'];
  if (database) args.push(database);
  const res = spawnSync('docker', args, { input: sql, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`mysql gagal: ${res.stderr}`);
  return res.stdout.trim();
}

function recreateDatabase(name) {
  assertScratchName(name);
  mysql(`DROP DATABASE IF EXISTS ${name}; CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
}

function dropDatabase(name) {
  assertScratchName(name);
  mysql(`DROP DATABASE IF EXISTS ${name};`);
}

/** Folder prisma sementara berisi schema + subset migrasi (untuk membuat database "sebelum CR-04a") */
function migrationsFolder(migrations) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp2-prisma-'));
  fs.copyFileSync(path.join(SERVER_DIR, 'prisma', 'schema.prisma'), path.join(dir, 'schema.prisma'));
  fs.mkdirSync(path.join(dir, 'migrations'));
  fs.copyFileSync(path.join(SERVER_DIR, 'prisma', 'migrations', 'migration_lock.toml'), path.join(dir, 'migrations', 'migration_lock.toml'));
  for (const m of migrations) fs.cpSync(path.join(SERVER_DIR, 'prisma', 'migrations', m), path.join(dir, 'migrations', m), { recursive: true });
  return path.join(dir, 'schema.prisma');
}

// Step 7d: semua perintah dijalankan sebagai skrip JS lewat Node yang sama (process.execPath), tanpa shell. Shim
// `node_modules/.bin/prisma` tidak dapat di-spawn langsung di Windows (prisma.cmd) → status null tanpa pesan.
function run(scriptArgs, name, env = {}) {
  const res = spawnSync(process.execPath, scriptArgs, {
    cwd: SERVER_DIR, encoding: 'utf8', env: { ...process.env, DATABASE_URL: urlFor(name), ...env },
  });
  const spawnError = res.error ? `[spawn gagal] ${res.error.message}\n` : '';
  const output = `${spawnError}${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  fs.appendFileSync(path.join(ARTIFACT_DIR, 'cp2-commands.log'),
    `\n$ node ${scriptArgs.join(' ')} [${name}] → ${res.status}\n${output}`);
  return { status: res.status, output };
}

/** Entry point JS Prisma CLI dari paket terpasang; versi wajib sama dengan devDependencies (bukan CLI lain di PATH) */
function resolvePrismaCli() {
  const pkgPath = require.resolve('prisma/package.json', { paths: [SERVER_DIR] });
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8')).devDependencies?.prisma;
  if (pkg.version !== expected) throw new Error(`Versi Prisma CLI ${pkg.version} ≠ package.json ${expected}`);
  const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
  if (!entry) throw new Error('Entry point bin prisma tidak ditemukan di package.json paket prisma.');
  const cli = path.join(path.dirname(pkgPath), entry);
  if (!fs.existsSync(cli)) throw new Error(`Entry point Prisma CLI tidak ada: ${cli}`);
  return { cli, version: pkg.version };
}

const PRISMA = resolvePrismaCli();
/** prisma migrate deploy; `preCr04a` = hanya migrasi sebelum CR-04a; `upToCr04a` = sampai CR-04a (tanpa CR-04b) */
const deploy = (name, { preCr04a = false, upToCr04a = false } = {}) => {
  const subset = preCr04a ? PRE_CR04A : upToCr04a ? UP_TO_CR04A : null;
  return run([PRISMA.cli, 'migrate', 'deploy', ...(subset ? ['--schema', migrationsFolder(subset)] : [])], name);
};
const seed = (name, env = {}) => run(['prisma/seed.js'], name, env);
const checkLedger = (name, args = [], env = {}) => run(['prisma/checkLedger.js', ...args], name, env);
const snapshot = (name, args) => run(['prisma/stockSnapshot.js', ...args], name);

function dump(name, file) {
  assertScratchName(name);
  const res = spawnSync('docker', ['exec', CONTAINER, 'mysqldump', '-uroot', `-p${ROOT_PASSWORD}`, '--single-transaction',
    '--routines', '--triggers', name], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`mysqldump gagal: ${res.stderr}`);
  fs.writeFileSync(file, res.stdout);
}

function restore(name, file) {
  recreateDatabase(name);
  mysql(fs.readFileSync(file, 'utf8'), name);
}

const clientFor = (name) => new PrismaClient({ datasources: { db: { url: urlFor(name) } } });
const query = async (client, sql, ...params) => plain(await client.$queryRawUnsafe(sql, ...params));

/** Jumlah baris & CHECKSUM seluruh tabel (selain _prisma_migrations) — bukti "tidak ada penulisan" */
function tableFingerprint(name) {
  const tables = mysql(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${name}'
    AND table_name <> '_prisma_migrations' ORDER BY table_name`).split('\n').filter(Boolean);
  return mysql(tables.map((t) => `SELECT '${t}', COUNT(*) FROM \`${t}\`; CHECKSUM TABLE \`${t}\`;`).join('\n'), name);
}

module.exports = {
  urlFor, mysql, recreateDatabase, dropDatabase, deploy, seed, checkLedger, snapshot, dump, restore, clientFor, query,
  tableFingerprint, PRISMA,
};
