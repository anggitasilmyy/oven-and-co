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

function run(command, args, name, env = {}) {
  const res = spawnSync(command, args, {
    cwd: SERVER_DIR, encoding: 'utf8', env: { ...process.env, DATABASE_URL: urlFor(name), ...env },
  });
  const output = `${res.stdout}\n${res.stderr}`;
  fs.appendFileSync(path.join(ARTIFACT_DIR, 'cp2-commands.log'), `\n$ ${command} ${args.join(' ')} [${name}] → ${res.status}\n${output}`);
  return { status: res.status, output };
}

const prismaBin = path.join(SERVER_DIR, 'node_modules', '.bin', 'prisma');
/** prisma migrate deploy; `preCr04a` = hanya migrasi sebelum CR-04a */
const deploy = (name, { preCr04a = false } = {}) => run(prismaBin, ['migrate', 'deploy',
  ...(preCr04a ? ['--schema', migrationsFolder(PRE_CR04A)] : [])], name);
const seed = (name, env = {}) => run('node', ['prisma/seed.js'], name, env);
const checkLedger = (name, args = [], env = {}) => run('node', ['prisma/checkLedger.js', ...args], name, env);
const snapshot = (name, args) => run('node', ['prisma/stockSnapshot.js', ...args], name);

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
  tableFingerprint,
};
