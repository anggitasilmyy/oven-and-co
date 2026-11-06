// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2: lib/prismaClients.js (opsi C). Client utama (pool 5) untuk query
// biasa & auth; client transaksi (pool 4, timeout 15 s, maxWait 2 s) untuk semua $transaction; urutan per transaksi:
// probe nonce → simpan & pasang lock wait 2 s → callback → pulihkan sesi; $disconnect menutup kedua pool. Kelas PrismaClient
// tiruan; perilaku MySQL sungguhan (CONNECTION_ID per pool, opsi per panggilan) di tests-mysql/08-transaction-client.it.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPrismaClients, withConnectionLimit, MAIN_CONNECTION_LIMIT, TRANSACTION_CONNECTION_LIMIT, TRANSACTION_OPTIONS,
} = require('../src/lib/prismaClients');

function fakePrismaClass({ disconnectError = null } = {}) {
  const instances = [];
  class FakePrismaClient {
    constructor(config) {
      this.config = config;
      this.statements = [];
      this.disconnected = false;
      this.user = { findUnique: async () => ({ client: instances.indexOf(this) }) };
      instances.push(this);
    }

    async $transaction(input, options) {
      this.lastOptions = options;
      const tx = {
        $queryRaw: async (strings, ...values) => { this.statements.push(strings.join('?')); return [{ nonce: BigInt(values[0]), conn: 77n }]; },
        $executeRawUnsafe: async (sql) => { this.statements.push(sql); return 0; },
      };
      return input(tx);
    }

    async $disconnect() {
      this.disconnected = true;
      if (disconnectError && instances.indexOf(this) === 1) throw disconnectError;
    }
  }
  return { FakePrismaClient, instances };
}

const URL_IN = 'mysql://app:p%40ss@db.example:3306/oven?sslaccept=strict&pool_timeout=20&connection_limit=33';

test('withConnectionLimit: hanya connection_limit yang diganti; parameter & kredensial lain dipertahankan', () => {
  const out = new URL(withConnectionLimit(URL_IN, 4));
  assert.equal(out.searchParams.get('connection_limit'), '4');
  assert.equal(out.searchParams.get('sslaccept'), 'strict');
  assert.equal(out.searchParams.get('pool_timeout'), '20');
  assert.equal(out.username, 'app');
  assert.equal(out.password, 'p%40ss');
  assert.equal(`${out.host}${out.pathname}`, 'db.example:3306/oven');
  assert.equal(new URL(withConnectionLimit('mysql://u:p@h:1/d', 5)).searchParams.get('connection_limit'), '5');
});

test('dua client: utama pool 5, transaksi pool 4 + timeout 15 s / maxWait 2 s', () => {
  const { FakePrismaClient, instances } = fakePrismaClass();
  createPrismaClients({ databaseUrl: URL_IN, PrismaClient: FakePrismaClient });
  assert.equal(instances.length, 2);
  const [main, tx] = instances;
  assert.equal(new URL(main.config.datasources.db.url).searchParams.get('connection_limit'), String(MAIN_CONNECTION_LIMIT));
  assert.equal(main.config.transactionOptions, undefined);
  assert.equal(new URL(tx.config.datasources.db.url).searchParams.get('connection_limit'), String(TRANSACTION_CONNECTION_LIMIT));
  assert.deepEqual(tx.config.transactionOptions, { timeout: 15000, maxWait: 2000 });
  assert.deepEqual(TRANSACTION_OPTIONS, { timeout: 15000, maxWait: 2000 });
  assert.equal(MAIN_CONNECTION_LIMIT + TRANSACTION_CONNECTION_LIMIT, 9);
});

test('tanpa DATABASE_URL: konfigurasi datasource tidak dipaksakan (Prisma membaca env sendiri)', () => {
  const { FakePrismaClient, instances } = fakePrismaClass();
  createPrismaClients({ databaseUrl: undefined, PrismaClient: FakePrismaClient });
  assert.equal(instances[0].config.datasources, undefined);
  assert.equal(instances[1].config.datasources, undefined);
});

test('query biasa memakai client utama; $transaction dialihkan ke client transaksi dengan urutan probe → SET → callback → pulihkan', async () => {
  const { FakePrismaClient, instances } = fakePrismaClass();
  const { prisma, transactionClient } = createPrismaClients({ databaseUrl: URL_IN, PrismaClient: FakePrismaClient });
  assert.equal(prisma, instances[0]);
  assert.equal(transactionClient, instances[1]);
  assert.deepEqual(await prisma.user.findUnique(), { client: 0 });

  const result = await prisma.$transaction(async () => 'ok', { maxWait: 5000, timeout: 10000 });
  assert.equal(result, 'ok');
  assert.deepEqual(instances[0].statements, [], 'client utama tidak menjalankan transaksi');
  assert.deepEqual(instances[1].statements, [
    'SELECT ? AS nonce, CONNECTION_ID() AS conn',
    'SET @ovc_saved_lock_wait = COALESCE(@ovc_saved_lock_wait, @@SESSION.innodb_lock_wait_timeout)',
    'SET SESSION innodb_lock_wait_timeout = 2',
    'SET SESSION innodb_lock_wait_timeout = @ovc_saved_lock_wait',
    'SET @ovc_saved_lock_wait = NULL',
  ]);
  assert.deepEqual(instances[1].lastOptions, { maxWait: 5000, timeout: 10000 }, 'opsi per panggilan (runInReadSnapshot) diteruskan apa adanya');
});

test('$disconnect menutup KEDUA pool; kegagalan satu pool tetap menutup yang lain lalu error diteruskan', async () => {
  const ok = fakePrismaClass();
  const { prisma } = createPrismaClients({ databaseUrl: URL_IN, PrismaClient: ok.FakePrismaClient });
  await prisma.$disconnect();
  assert.deepEqual(ok.instances.map((i) => i.disconnected), [true, true]);

  const boom = new Error('gagal tutup');
  const bad = fakePrismaClass({ disconnectError: boom });
  const second = createPrismaClients({ databaseUrl: URL_IN, PrismaClient: bad.FakePrismaClient });
  await assert.rejects(second.prisma.$disconnect(), (e) => e === boom);
  assert.deepEqual(bad.instances.map((i) => i.disconnected), [true, true]);
});
