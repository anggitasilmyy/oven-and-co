// Integrasi MySQL 8 — Validasi AD-11 (C3) · temuan F-2 (revisi): lib/transactionLockWait.js. Setiap transaksi interaktif
// Prisma menyimpan nilai sesi innodb_lock_wait_timeout, memasang 2 s sebelum query callback, lalu MEMULIHKAN nilai
// tersimpan di dalam transaksi sebelum commit/rollback — pada jalur sukses, exception, dan error database. Error pemulihan
// tidak menutupi error utama. Diuji dengan klien tiruan; perilaku MySQL sungguhan (nilai per koneksi, pool satu koneksi,
// 1205, P2028) dibuktikan di tests-mysql/07-session-lock-wait.it.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTransactionLockWaitTimeout, DB_LOCK_WAIT_TIMEOUT_SECONDS, SESSION_STATEMENTS } = require('../src/lib/transactionLockWait');

const SAVE = 'SET @ovc_saved_lock_wait = COALESCE(@ovc_saved_lock_wait, @@SESSION.innodb_lock_wait_timeout)';
const APPLY = 'SET SESSION innodb_lock_wait_timeout = 2';
const RESTORE = 'SET SESSION innodb_lock_wait_timeout = @ovc_saved_lock_wait';
const CLEAR = 'SET @ovc_saved_lock_wait = NULL';

/**
 * Klien tiruan yang meniru sesi MySQL satu koneksi: `session` = innodb_lock_wait_timeout, `saved` = @ovc_saved_lock_wait.
 * failOn(sql) → Error untuk pernyataan tertentu (meniru transaksi yang sudah ditutup Prisma).
 */
function fakeClient({ session = 50, failOn = () => null } = {}) {
  const state = { session, saved: null, calls: [] };
  state.$transaction = async (input, options) => {
    state.calls.push({ kind: typeof input === 'function' ? 'interactive' : 'array', options, statements: [] });
    if (typeof input !== 'function') return 'array-result';
    const { statements } = state.calls.at(-1);
    const tx = {
      $executeRawUnsafe: async (sql) => {
        statements.push(sql);
        const failure = failOn(sql);
        if (failure) throw failure;
        if (sql === SAVE) state.saved = state.saved ?? state.session;
        else if (sql === APPLY || /^SET SESSION innodb_lock_wait_timeout = \d+$/.test(sql)) state.session = Number(sql.split('= ')[1]);
        else if (sql === RESTORE) state.session = state.saved;
        else if (sql === CLEAR) state.saved = null;
        return 0;
      },
      query: async (name) => { statements.push(name); return { name, session: state.session }; },
    };
    return input(tx);
  };
  return state;
}

test('nilai bawaan 2 detik; pernyataan sesi tetap', () => {
  assert.equal(DB_LOCK_WAIT_TIMEOUT_SECONDS, 2);
  assert.deepEqual([SESSION_STATEMENTS.save, SESSION_STATEMENTS.apply(2), SESSION_STATEMENTS.restore, SESSION_STATEMENTS.clear], [SAVE, APPLY, RESTORE, CLEAR]);
});

test('sukses: simpan → SET 2 → callback (melihat 2) → pulihkan → hasil & opsi diteruskan; nilai awal bukan 50 dipertahankan', async () => {
  const client = applyTransactionLockWaitTimeout(fakeClient({ session: 7 }));
  const options = { maxWait: 1000, timeout: 4000 };
  const result = await client.$transaction((tx) => tx.query('SELECT … FOR UPDATE'), options);
  assert.deepEqual(result, { name: 'SELECT … FOR UPDATE', session: 2 });
  assert.deepEqual(client.calls[0].statements, [SAVE, APPLY, 'SELECT … FOR UPDATE', RESTORE, CLEAR]);
  assert.equal(client.calls[0].options, options);
  assert.deepEqual([client.session, client.saved], [7, null]);
});

test('callback melempar (rollback / exception / error 1205): error ASLI diteruskan, sesi tetap dipulihkan', async () => {
  for (const error of [new Error('gagal bisnis'), new TypeError('bug'), Object.assign(new Error('Code: `1205`'), { code: 'P2010' })]) {
    const client = applyTransactionLockWaitTimeout(fakeClient({ session: 9 }));
    await assert.rejects(client.$transaction(async (tx) => { await tx.query('q'); throw error; }), (e) => e === error);
    assert.equal(error.sessionRestoreError, undefined);
    assert.deepEqual(client.calls[0].statements, [SAVE, APPLY, 'q', RESTORE, CLEAR]);
    assert.deepEqual([client.session, client.saved], [9, null]);
  }
});

test('pemulihan gagal saat callback gagal (mis. P2028): error utama tetap yang dilempar, error pemulihan dilampirkan', async () => {
  const closed = Object.assign(new Error('Transaction already closed'), { code: 'P2028' });
  const client = applyTransactionLockWaitTimeout(fakeClient({ failOn: (sql) => (sql === RESTORE ? closed : null) }));
  const primary = Object.assign(new Error('expired transaction'), { code: 'P2028' });
  await assert.rejects(client.$transaction(async () => { throw primary; }), (e) => e === primary);
  assert.equal(primary.sessionRestoreError, closed);
  assert.deepEqual([client.session, client.saved], [2, 50], 'nilai asli tetap di penanda');
});

test('penanda yang tertinggal dipakai transaksi berikutnya: nilai ASLI dipulihkan, bukan nilai bocor', async () => {
  const closed = new Error('Transaction already closed');
  let failRestore = true;
  const client = applyTransactionLockWaitTimeout(fakeClient({ session: 7, failOn: (sql) => (sql === RESTORE && failRestore ? closed : null) }));
  await assert.rejects(client.$transaction(async () => { throw new Error('timeout'); }));
  assert.deepEqual([client.session, client.saved], [2, 7]); // bocor
  failRestore = false;
  await client.$transaction((tx) => tx.query('q'));
  assert.deepEqual([client.session, client.saved], [7, null]);
});

test('callback sukses tetapi pemulihan gagal → error pemulihan dilempar (kondisi sesi tidak disembunyikan)', async () => {
  const broken = new Error('restore gagal');
  const client = applyTransactionLockWaitTimeout(fakeClient({ failOn: (sql) => (sql === RESTORE ? broken : null) }));
  await assert.rejects(client.$transaction((tx) => tx.query('q')), (e) => e === broken);
});

test('SET 2 gagal → callback tidak dijalankan, sesi dipulihkan, error SET diteruskan', async () => {
  const refused = new Error('Access denied');
  const client = applyTransactionLockWaitTimeout(fakeClient({ session: 7, failOn: (sql) => (sql === APPLY ? refused : null) }));
  let ran = false;
  await assert.rejects(client.$transaction(async () => { ran = true; }), (e) => e === refused);
  assert.equal(ran, false);
  assert.deepEqual([client.session, client.saved], [7, null]);
});

test('setiap transaksi memasang & memulihkan ulang (berlaku di koneksi pool mana pun); bentuk array tidak diubah', async () => {
  const client = applyTransactionLockWaitTimeout(fakeClient(), 3);
  await client.$transaction(async () => 1);
  await client.$transaction(async () => 2);
  assert.deepEqual(client.calls.map((c) => c.statements), [
    [SAVE, 'SET SESSION innodb_lock_wait_timeout = 3', RESTORE, CLEAR],
    [SAVE, 'SET SESSION innodb_lock_wait_timeout = 3', RESTORE, CLEAR],
  ]);
  assert.equal(await client.$transaction(['q1'], { isolationLevel: 'Serializable' }), 'array-result');
  assert.deepEqual(client.calls.at(-1), { kind: 'array', options: { isolationLevel: 'Serializable' }, statements: [] });
});

test('nilai tidak sah ditolak saat konfigurasi (bukan bilangan bulat ≥ 1)', () => {
  for (const bad of [0, -1, 1.5, '2', null, Number.NaN]) {
    assert.throws(() => applyTransactionLockWaitTimeout(fakeClient(), bad), /tidak valid/, String(bad));
  }
});
