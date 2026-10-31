// Regresi tingkat HTTP Step 6.4.10 C3c: PATCH /api/admin/staff/:id/active (FR-36 · FR-26 · UC-30 · A-11 · AD-11
// "Nonaktifkan / Aktifkan akun"). Hanya Owner aktif; akun sendiri 400; Owner aktif terakhir 409; bukan akun admin / tidak
// ada 404; ID tidak sah 400 INVALID_ID; idempoten tanpa UPDATE; urutan transaksi kunci store_settings → cek ulang pelaku
// (nonaktif → 401 SESSION_INVALID) → target → hitung Owner aktif → UPDATE bersyarat (count) → baca ulang; hanya kolom
// is_active berubah; respons tanpa password_hash/google_id; penonaktifan langsung berlaku di request berikutnya.
//
// BATAS BUKTI: fake tests/helpers/settingsDb.js membuktikan LOGIKA transaksi — urutan operasi, kunci sebagai operasi
// pertama, baca setelah kunci, serialisasi dua request lewat antrian kunci tiruan, rollback, dan UPDATE yang dievaluasi
// ulang pada data terbaru. Fake TIDAK membuktikan perilaku InnoDB sungguhan (kunci baris MySQL, read view Prisma `BEGIN`,
// deadlock dengan checkout, timeout transaksi) — itu diuji di MySQL 8 setelah C4 (rencana AD-11).

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installSettingsDb } = require('./helpers/settingsDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const PASSWORD = 'SandiStaf#2026';
const HASH = bcrypt.hashSync(PASSWORD, 4); // cost rendah hanya untuk data uji
const user = (userId, name, role, extra = {}) => ({
  userId: BigInt(userId), name, email: `u${userId}@demo.com`, phone: `+6281200000${String(userId).padStart(3, '0')}`,
  passwordHash: HASH, googleId: `google-${userId}-rahasia`, role, isActive: true,
  createdAt: new Date(`2026-01-0${userId}T00:00:00.000Z`), ...extra,
});
const userRows = () => [
  user(1, 'Anisa Pelanggan', 'customer'),
  user(2, 'Budi Staf', 'staf'),
  user(3, 'Citra Owner', 'owner'), // Owner A
  user(4, 'Dewi Owner', 'owner'), // Owner B
  user(5, 'Eka Staf Nonaktif', 'staf', { isActive: false }),
  user(6, 'Fajar Owner Nonaktif', 'owner', { isActive: false }), // Owner C
  user(7, 'Gita Pelanggan Nonaktif', 'customer', { isActive: false }),
];
const db = installSettingsDb(fakePrisma, {}, { userRows });

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => db.reset());

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
async function call(path, { method = 'PATCH', body, token = tokenFor('3') } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const setActive = (id, isActive, actor = '3') => call(`/admin/staff/${id}/active`, { body: { is_active: isActive }, token: tokenFor(actor) });
const userOf = (id) => db.committed.users.find((u) => u.userId === BigInt(id));
const activeOwners = () => db.committed.users.filter((u) => u.role === 'owner' && u.isActive).map((u) => String(u.userId)).sort();
const quiet = async (fn) => { const o = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = o; } };
const ACCOUNT_KEYS = ['created_at', 'email', 'is_active', 'name', 'phone', 'role', 'user_id'];
const WHITELIST = ['createdAt', 'email', 'isActive', 'name', 'phone', 'role', 'userId'];
const NOT_UPDATED = 'Status akun gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi.';
const FULL_FLOW = ['lock:store_settings', 'user.findUnique', 'user.findUnique', 'user.updateMany', 'user.findUnique'];

function assertCleanTx() {
  assert.deepEqual(db.violations, []);
  assert.deepEqual(db.globalCalls, []);
  for (const t of db.transactions) assert.equal(t.ops[0], 'lock:store_settings', `tx ${t.id}: kunci = operasi pertama`);
}
/** Semua kolom semua pengguna sama dengan seed, kecuali is_active pengguna yang disebut */
function assertOnlyIsActiveChanged(changed = {}) {
  const seed = userRows();
  for (const row of db.committed.users) {
    const original = seed.find((u) => u.userId === row.userId);
    const expected = { ...original, isActive: changed[String(row.userId)] ?? original.isActive };
    assert.deepEqual(row, expected, `user ${row.userId}`);
  }
  assert.equal(db.committed.users.length, seed.length);
}

// ---------------------------------------------------------------- hak akses & validasi

test('hanya Owner aktif: tamu 401, pelanggan & Staf 403, Owner nonaktif 401 SESSION_INVALID; tanpa transaksi', async () => {
  assert.equal((await call('/admin/staff/2/active', { body: { is_active: false }, token: null })).status, 401);
  assert.equal((await setActive(2, false, '1')).status, 403);
  assert.equal((await setActive(5, true, '2')).status, 403);
  const inactive = await setActive(2, false, '6');
  assert.deepEqual([inactive.status, inactive.json.code], [401, 'SESSION_INVALID']);
  assert.equal(db.transactions.length, 0);
  assertOnlyIsActiveChanged();
});

test('ID tidak sah → 400 INVALID_ID; body tidak sah → 400; keduanya tanpa transaksi', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '9223372036854775808', '01']) {
    const res = await call(`/admin/staff/${id}/active`, { body: { is_active: false } });
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_ID'], id);
  }
  for (const body of [{}, { is_active: 'false' }, { is_active: 0 }, { is_active: null }]) {
    const res = await call('/admin/staff/2/active', { body });
    assert.deepEqual([res.status, res.json.message], [400, 'Status aktif tidak valid.'], JSON.stringify(body));
  }
  assert.equal(db.transactions.length, 0);
});

test('akun tidak ditemukan & akun pelanggan (aktif/nonaktif) → 404 tanpa UPDATE; baris pelanggan tidak berubah', async () => {
  for (const [id, isActive] of [['999', false], ['1', false], ['7', true], ['1', true]]) {
    db.reset();
    const res = await setActive(id, isActive);
    assert.deepEqual([res.status, res.json.message], [404, 'Akun admin tidak ditemukan'], `${id}/${isActive}`);
    const [tx] = db.transactions;
    assert.deepEqual(tx.ops, ['lock:store_settings', 'user.findUnique', 'user.findUnique']); // 404 sebelum UPDATE
    assert.deepEqual(tx.userUpdates, []);
    assertOnlyIsActiveChanged();
  }
  assertCleanTx();
});

// ---------------------------------------------------------------- aktif / nonaktif

test('nonaktifkan Staf: 200 dari baca ulang; urutan lengkap; UPDATE bersyarat hanya is_active; Staf langsung tidak bisa masuk', async () => {
  const before = await call('/payment-methods', { method: 'GET', token: tokenFor('2') }); // Staf masih aktif → lolos auth
  assert.notEqual(before.status, 401);

  const { status, json } = await setActive(2, false);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json.data).sort(), ACCOUNT_KEYS);
  assert.deepEqual([json.data.user_id, json.data.role, json.data.is_active], ['2', 'staf', false]);
  const tx = db.transactions.at(-1);
  assert.deepEqual(tx.ops, FULL_FLOW); // Staf: tanpa hitung Owner aktif
  assert.deepEqual(tx.userUpdates, [{ where: { userId: 2n, role: { in: ['staf', 'owner'] }, isActive: true }, data: { isActive: false } }]);
  assertOnlyIsActiveChanged({ 2: false });

  const after = await call('/payment-methods', { method: 'GET', token: tokenFor('2') }); // token lama
  assert.deepEqual([after.status, after.json.code], [401, 'SESSION_INVALID']);
  const login = await call('/auth/login', { method: 'POST', body: { identifier: 'u2@demo.com', password: PASSWORD }, token: null });
  assert.equal(login.status, 401);
  // Probe /api/payment-methods hanya untuk hasil auth; handler AD-03 lama memakai Prisma global (dicatat penjaga fake)
  assert.deepEqual(db.globalCalls, ['paymentMethod.findMany']); // hanya probe pertama (sebelum nonaktif) sampai handler
  db.globalCalls.length = 0;
  assertCleanTx();
});

test('aktifkan Staf nonaktif: 200, bisa masuk lagi; hanya is_active berubah', async () => {
  const { status, json } = await setActive(5, true);
  assert.deepEqual([status, json.data.user_id, json.data.is_active], [200, '5', true]);
  assert.deepEqual(db.transactions[0].userUpdates[0].where, { userId: 5n, role: { in: ['staf', 'owner'] }, isActive: false });
  assertOnlyIsActiveChanged({ 5: true });
  const login = await call('/auth/login', { method: 'POST', body: { identifier: 'u5@demo.com', password: PASSWORD }, token: null });
  assert.equal(login.status, 200);
  assertCleanTx();
});

test('Owner menonaktifkan Owner lain (masih ada Owner aktif): 200; Owner aktif dihitung ulang setelah kunci; target langsung 401', async () => {
  const { status, json } = await setActive(4, false);
  assert.deepEqual([status, json.data.role, json.data.is_active], [200, 'owner', false]);
  const [tx] = db.transactions;
  assert.deepEqual(tx.ops, ['lock:store_settings', 'user.findUnique', 'user.findUnique', 'user.findMany', 'user.updateMany', 'user.findUnique']);
  assert.deepEqual(activeOwners(), ['3']);
  assertOnlyIsActiveChanged({ 4: false });
  const next = await call('/admin/staff', { method: 'GET', token: tokenFor('4') });
  assert.deepEqual([next.status, next.json.code], [401, 'SESSION_INVALID']);
  // Owner nonaktif bisa diaktifkan kembali oleh Owner aktif
  assert.equal((await setActive(4, true)).json.data.is_active, true);
  assert.deepEqual(activeOwners(), ['3', '4']);
  assertCleanTx();
});

test('Owner tidak bisa menonaktifkan akunnya sendiri (juga saat ia Owner aktif terakhir) → 400 tanpa UPDATE', async () => {
  const self = await setActive(3, false);
  assert.deepEqual([self.status, self.json.message], [400, 'Tidak dapat menonaktifkan akun yang sedang dipakai']);
  db.reset();
  db.committed.users.find((u) => u.userId === 4n).isActive = false; // tinggal Owner A aktif
  const last = await setActive(3, false);
  assert.deepEqual([last.status, last.json.message], [400, 'Tidak dapat menonaktifkan akun yang sedang dipakai']);
  assert.deepEqual(db.transactions[0].userUpdates, []);
  assert.deepEqual(activeOwners(), ['3']);
  assertCleanTx();
});

test('Owner aktif terakhir → 409 bila hitungan setelah kunci hanya menyisakan target (lapis pertahanan ketiga)', async () => {
  // Dengan cek ulang pelaku, pelaku (Owner aktif) selalu ikut terhitung sehingga cabang ini tidak tercapai lewat urutan
  // normal; uji ini memastikan pengaman tetap bekerja bila hitungan Owner aktif menyisakan target saja.
  db.transformRead = (op, rows) => (op === 'user.findMany' ? rows.filter((r) => r.userId === 4n) : rows);
  const res = await setActive(4, false);
  assert.deepEqual([res.status, res.json.message], [409, 'Minimal satu akun Owner harus tetap aktif']);
  assert.deepEqual(db.transactions[0].userUpdates, []);
  assert.equal(db.transactions[0].committed, false);
  assertOnlyIsActiveChanged();
});

test('idempoten: status sudah sesuai tujuan → 200 dari baris yang dibaca setelah kunci, tanpa UPDATE', async () => {
  for (const [id, isActive] of [['2', true], ['5', false], ['6', false], ['3', true]]) {
    db.reset();
    const { status, json } = await setActive(id, isActive);
    assert.deepEqual([status, json.data.user_id, json.data.is_active], [200, id, isActive], `${id}/${isActive}`);
    assert.deepEqual(db.transactions[0].ops, ['lock:store_settings', 'user.findUnique', 'user.findUnique']);
    assertOnlyIsActiveChanged();
  }
  assertCleanTx();
});

test('UPDATE count 0 / baca ulang tidak sesuai / baris hilang → 409 tanpa sukses palsu, rollback', async () => {
  db.forceCount = { 'user.updateMany': 0 };
  const zero = await setActive(2, false);
  assert.deepEqual([zero.status, zero.json.message], [409, NOT_UPDATED]);
  assert.deepEqual(db.transactions[0].ops, FULL_FLOW.slice(0, 4));
  assertOnlyIsActiveChanged();

  let readbacks;
  for (const tamper of [(row) => ({ ...row, isActive: true }), () => null]) {
    db.reset();
    readbacks = 0;
    db.transformRead = (op, row) => (op === 'user.findUnique' && (readbacks += 1) === 3 ? tamper(row) : row);
    const res = await setActive(2, false);
    assert.deepEqual([res.status, res.json.message], [409, NOT_UPDATED]);
    assert.equal(db.transactions[0].committed, false);
    assertOnlyIsActiveChanged(); // UPDATE yang sempat terjadi dibatalkan
  }
  assertCleanTx();
});

test('respons & query tanpa data sensitif: password_hash/google_id tidak dibaca maupun dikirim; pelaku hanya role & status', async () => {
  const reads = [];
  db.transformRead = (op, row) => { reads.push(row && Object.keys(row).sort()); return row; };
  const { json } = await setActive(4, false);
  const body = JSON.stringify(json).toLowerCase();
  for (const leaked of ['hash', 'google', 'rahasia', 'password', '$2b$']) assert.ok(!body.includes(leaked), leaked);
  assert.deepEqual(reads[0], ['isActive', 'role']); // pelaku
  assert.deepEqual(reads[1], WHITELIST); // target
  assert.deepEqual(reads.at(-1), WHITELIST); // baca ulang
});

test('gagal di tengah transaksi → 500 umum & rollback penuh', async () => {
  db.failOn = (op) => op === 'user.findUnique' && db.transactions[0].ops.filter((o) => o === 'user.findUnique').length === 3;
  const res = await quiet(() => setActive(2, false));
  assert.deepEqual([res.status, res.json.message], [500, 'Terjadi kesalahan pada server.']);
  assert.equal(db.transactions[0].committed, false);
  assertOnlyIsActiveChanged();
});

// ---------------------------------------------------------------- konkurensi (logika serialisasi, bukan InnoDB)

test('Skenario A: Owner A & Owner B saling menonaktifkan bersamaan (10 putaran) → selalu [200, 401], tepat satu Owner aktif', async () => {
  for (let round = 0; round < 10; round += 1) {
    db.reset();
    db.afterLock = () => new Promise((resolve) => setTimeout(resolve, 15)); // pemegang kunci ditahan → yang lain menunggu
    const pair = round % 2 ? [setActive(3, false, '4'), setActive(4, false, '3')] : [setActive(4, false, '3'), setActive(3, false, '4')];
    const results = await Promise.all(pair);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401], `putaran ${round}`);
    assert.equal(results.find((r) => r.status === 401).json.code, 'SESSION_INVALID');
    assert.equal(activeOwners().length, 1, `putaran ${round}: tepat satu Owner aktif`);
    assert.equal(db.lockWaits, 1, `putaran ${round}: request kedua menunggu kunci`);
    const loser = db.transactions.find((t) => !t.committed);
    assert.deepEqual(loser.ops, ['lock:store_settings', 'user.findUnique']); // berhenti di cek ulang pelaku
    assertCleanTx();
  }
});

/** Jalankan `first` sampai memegang kunci, kirim `second` (lolos auth karena pelakunya masih aktif), lalu lepas kunci */
async function whileLockHeld(first, second) {
  let release;
  let held;
  let holderId = null;
  const lockHeld = new Promise((resolve) => { held = resolve; });
  // Tahan transaksi PERTAMA yang memperoleh kunci di uji ini (id transaksi fake berlanjut antar-uji)
  db.afterLock = (txId) => {
    if (holderId != null) return undefined;
    holderId = txId;
    return new Promise((resolve) => { release = resolve; held(); });
  };
  const deadline = Date.now() + 5000;
  const firstDone = first();
  let timer;
  await Promise.race([lockHeld, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('request pertama tidak pernah memegang kunci store_settings')), 5000);
  })]).finally(() => clearTimeout(timer));
  const secondDone = second();
  while (db.lockWaits === 0) { // second sudah lolos auth & menunggu kunci
    if (Date.now() > deadline) { release(); throw new Error('request kedua tidak pernah menunggu kunci'); }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  release();
  return Promise.all([firstDone, secondDone]);
}

test('Skenario B: pelaku dinonaktifkan selagi menunggu kunci → cek ulang setelah kunci = 401 SESSION_INVALID, tanpa efek', async () => {
  // A menonaktifkan B; B (sudah lolos auth) sedang menonaktifkan Staf
  const [byA, byB] = await whileLockHeld(() => setActive(4, false, '3'), () => setActive(2, false, '4'));
  assert.equal(byA.status, 200);
  assert.deepEqual([byB.status, byB.json.code], [401, 'SESSION_INVALID']);
  assert.equal(userOf(2).isActive, true); // permintaan B tidak berefek
  assert.deepEqual(db.transactions.find((t) => !t.committed).ops, ['lock:store_settings', 'user.findUnique']);
  assertCleanTx();
});

test('Skenario B (3 Owner): A menonaktifkan B selagi B menonaktifkan C → B ditolak 401, C tetap aktif', async () => {
  db.committed.users.find((u) => u.userId === 6n).isActive = true; // Owner C aktif
  const [byA, byB] = await whileLockHeld(() => setActive(4, false, '3'), () => setActive(6, false, '4'));
  assert.equal(byA.status, 200);
  assert.deepEqual([byB.status, byB.json.code], [401, 'SESSION_INVALID']);
  assert.deepEqual(activeOwners(), ['3', '6']); // tanpa cek ulang pelaku: B (nonaktif) akan menonaktifkan C
  assertCleanTx();
});

test('Skenario B (diri sendiri): A menonaktifkan B selagi B mencoba menonaktifkan dirinya → B 401 (bukan 400), A tetap aktif', async () => {
  const [byA, byB] = await whileLockHeld(() => setActive(4, false, '3'), () => setActive(4, false, '4'));
  assert.equal(byA.status, 200);
  assert.deepEqual([byB.status, byB.json.code], [401, 'SESSION_INVALID']);
  assert.deepEqual(activeOwners(), ['3']);
  assertCleanTx();
});
