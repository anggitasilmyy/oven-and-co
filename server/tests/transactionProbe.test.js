// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2: lib/transactionProbe.js. Probe `SELECT nonce, CONNECTION_ID()`
// adalah pernyataan PERTAMA setiap transaksi interaktif; gagal/tidak cocok → transaksi dibatalkan sebelum callback dan
// diulang maks. 2 kali; tidak cocok → tepat satu SELECT read-only tambahan (pemicu Prisma membuang koneksi rusak). Callback
// tidak pernah berjalan sebelum probe berhasil dan tidak pernah diulang. Klien tiruan;
// perilaku MySQL sungguhan (koneksi rusak setelah P2028 dibuang, retry di koneksi lain) di tests-mysql/08 (I3).

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTransactionProbe, MAX_PROBE_RETRIES, PROBE_MISMATCH } = require('../src/lib/transactionProbe');

/**
 * Klien tiruan. `probeOutcomes[i]` untuk transaksi ke-i: 'ok' | 'mismatch' | Error (dilempar query probe).
 * Koneksi transaksi ke-i ber-ID 100 + i. Mencatat urutan pernyataan per transaksi dan commit/rollback.
 */
function fakeClient(probeOutcomes = [], { recoveryError = null } = {}) {
  const state = { transactions: [], beginError: null };
  state.$transaction = async (input, options) => {
    if (typeof input !== 'function') { state.transactions.push({ kind: 'array', options }); return 'array-result'; }
    if (state.beginError) throw state.beginError;
    const index = state.transactions.length;
    const record = { kind: 'interactive', options, statements: [], outcome: null };
    state.transactions.push(record);
    const tx = {
      id: index,
      $queryRaw: async (strings, ...values) => {
        record.statements.push(`${strings.join('?')} [${values.join(',')}]`);
        if (strings.join('?').includes('AS recovery')) {
          if (recoveryError) throw recoveryError;
          return [{ recovery: BigInt(values[0]) }];
        }
        const outcome = probeOutcomes[index] ?? 'ok';
        if (outcome instanceof Error) throw outcome;
        return [{ nonce: outcome === 'mismatch' ? 0n : BigInt(values[0]), conn: BigInt(100 + index) }]; // MySQL: BIGINT
      },
      query: async (name) => { record.statements.push(name); return name; },
    };
    try {
      const result = await input(tx);
      record.outcome = 'commit';
      return result;
    } catch (error) {
      record.outcome = 'rollback';
      throw error;
    }
  };
  return state;
}
const P1017 = () => Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });

test('maks. retry = 2', () => assert.equal(MAX_PROBE_RETRIES, 2));

test('probe berhasil: SELECT nonce + CONNECTION_ID = pernyataan pertama, lalu callback tepat sekali; hasil & opsi diteruskan', async () => {
  const client = applyTransactionProbe(fakeClient());
  let calls = 0;
  const options = { timeout: 10000 };
  const result = await client.$transaction(async (tx) => { calls += 1; return tx.query('bisnis'); }, options);
  assert.equal(result, 'bisnis');
  assert.equal(calls, 1);
  assert.equal(client.transactions.length, 1);
  assert.match(client.transactions[0].statements[0], /^SELECT \? AS nonce, CONNECTION_ID\(\) AS conn \[\d+\]$/);
  assert.equal(client.transactions[0].statements[1], 'bisnis');
  assert.equal(client.transactions[0].options, options);
});

test('nonce unik per transaksi', async () => {
  const client = applyTransactionProbe(fakeClient());
  for (let i = 0; i < 20; i += 1) await client.$transaction(async () => null);
  assert.equal(new Set(client.transactions.map((t) => t.statements[0])).size, 20);
});

test('probe gagal (P1017) → transaksi diulang; callback tidak dijalankan pada percobaan gagal; onRetry dipanggil', async () => {
  const retries = [];
  const client = applyTransactionProbe(fakeClient([P1017(), 'ok']), { onRetry: (e, attempt) => retries.push([e.code, attempt]) });
  let calls = 0;
  assert.equal(await client.$transaction(async (tx) => { calls += 1; return tx.query('bisnis'); }), 'bisnis');
  assert.equal(calls, 1);
  assert.deepEqual(client.transactions.map((t) => [t.statements.length, t.outcome]), [[1, 'rollback'], [2, 'commit']]);
  assert.deepEqual(retries, [['P1017', 1]]);
});

test('hasil probe tidak cocok (respons basi) → diulang, callback hanya di transaksi yang lolos', async () => {
  const retries = [];
  const client = applyTransactionProbe(fakeClient(['mismatch', 'ok']), { onRetry: (e) => retries.push(e.code) });
  let calls = 0;
  await client.$transaction(async () => { calls += 1; });
  assert.equal(calls, 1);
  assert.deepEqual(retries, [PROBE_MISMATCH]);
  assert.deepEqual(client.transactions.map((t) => t.outcome), ['rollback', 'commit']);
  const [failed, passed] = client.transactions;
  assert.equal(failed.statements.length, 2, 'probe + TEPAT SATU pernyataan pemulihan');
  assert.match(failed.statements[1], /^SELECT \? AS recovery \[\d+\]$/, 'pernyataan pemulihan: SELECT read-only dengan nonce');
  assert.notEqual(failed.statements[1].match(/\[(\d+)\]/)[1], failed.statements[0].match(/\[(\d+)\]/)[1], 'nonce pemulihan berbeda dari nonce probe');
  assert.equal(passed.statements.length, 1, 'transaksi yang lolos tidak mengirim pernyataan pemulihan');
});

test('pernyataan pemulihan gagal (P1017 — koneksi dibuang) tidak menutupi error utama; tetap diulang', async () => {
  const recoveryError = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
  const always = applyTransactionProbe(fakeClient(['mismatch', 'mismatch', 'mismatch'], { recoveryError }));
  let ran = false;
  await assert.rejects(always.$transaction(async () => { ran = true; }), (e) => e.code === PROBE_MISMATCH);
  assert.equal(ran, false);
  assert.equal(always.transactions.length, 1 + MAX_PROBE_RETRIES);
  assert.ok(always.transactions.every((t) => t.statements.length === 2), 'satu pernyataan pemulihan per percobaan');
});

test('probe yang ERROR (bukan tidak cocok) tidak mengirim pernyataan pemulihan', async () => {
  const client = applyTransactionProbe(fakeClient([P1017(), 'ok']));
  await client.$transaction(async () => null);
  assert.equal(client.transactions[0].statements.length, 1);
});

test('probe gagal dua kali → percobaan ketiga berhasil; gagal tiga kali → error probe TERAKHIR diteruskan, callback tidak pernah jalan', async () => {
  const twice = applyTransactionProbe(fakeClient([P1017(), 'mismatch', 'ok']));
  let calls = 0;
  await twice.$transaction(async () => { calls += 1; });
  assert.equal(calls, 1);
  assert.equal(twice.transactions.length, 3);

  const last = Object.assign(new Error('panic'), { name: 'PrismaClientRustPanicError' });
  const always = applyTransactionProbe(fakeClient([P1017(), 'mismatch', last, 'ok']));
  let ran = false;
  await assert.rejects(always.$transaction(async () => { ran = true; }), (e) => e === last);
  assert.equal(ran, false);
  assert.equal(always.transactions.length, 1 + MAX_PROBE_RETRIES);
});

test('error bisnis setelah callback mulai (400/404/409/query/P1017/P2028) TIDAK diulang; diteruskan apa adanya', async () => {
  const errors = [
    Object.assign(new Error('Tulis alasan pembatalan'), { statusCode: 400 }),
    Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 }),
    Object.assign(new Error('Stok tidak mencukupi'), { statusCode: 409 }),
    Object.assign(new Error('Code: `1205`'), { code: 'P2010' }),
    P1017(), // gagal SETELAH probe lolos
    Object.assign(new Error('Transaction already closed: … expired transaction'), { code: 'P2028' }),
  ];
  for (const error of errors) {
    const client = applyTransactionProbe(fakeClient());
    let calls = 0;
    await assert.rejects(client.$transaction(async () => { calls += 1; throw error; }), (e) => e === error);
    assert.equal(calls, 1, error.message);
    assert.equal(client.transactions.length, 1, `${error.message}: tidak diulang`);
  }
});

test('gagal memulai transaksi sebelum probe (P2028 maxWait) tidak diulang', async () => {
  const fake = fakeClient();
  fake.beginError = Object.assign(new Error('Unable to start a transaction in the given time.'), { code: 'P2028' });
  const client = applyTransactionProbe(fake);
  let calls = 0;
  await assert.rejects(client.$transaction(async () => { calls += 1; }), (e) => e === fake.beginError);
  assert.equal(calls, 0);
});

test('transaksi bentuk array diteruskan tanpa probe', async () => {
  const client = applyTransactionProbe(fakeClient());
  assert.equal(await client.$transaction(['q'], { isolationLevel: 'Serializable' }), 'array-result');
  assert.deepEqual(client.transactions, [{ kind: 'array', options: { isolationLevel: 'Serializable' } }]);
});
