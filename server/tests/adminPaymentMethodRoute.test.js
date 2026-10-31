// Regresi tingkat HTTP Step 6.4.10 C2: PATCH /api/admin/payment-methods/:code/active (FR-36 · FR-14 · FR-15 · BR-05 ·
// AD-11 sakelar metode bayar). Hanya Owner; 404 metode tidak ada; 409 metode online aktif terakhir; idempoten tanpa
// UPDATE; kunci store_settings SEBELUM membaca metode; dua Owner bersamaan diserialkan sehingga tidak mungkin keduanya
// menonaktifkan metode online terakhir. Fake: tests/helpers/settingsDb.js (kunci & read view ala InnoDB).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installSettingsDb, seedTables } = require('./helpers/settingsDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
  6: { userId: 6n, role: 'owner', isActive: true },
};
const db = installSettingsDb(fakePrisma, users);
const LAST_ONLINE = 'Minimal satu metode bayar online harus aktif (BR-05: pre-order, custom cake, dan delivery wajib online)';

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/payment-methods`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => db.reset());

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
async function patch(code, body, token = tokenFor('4')) {
  const res = await fetch(`${baseUrl}/${code}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const activeOf = (code) => db.committed.paymentMethods.find((m) => m.methodCode === code).isActive;
const activeOnline = () => db.committed.paymentMethods.filter((m) => m.isActive && m.methodGroup !== 'store').map((m) => m.methodCode).sort();
function assertCleanTx() {
  assert.deepEqual(db.violations, []);
  assert.deepEqual(db.globalCalls, []);
  for (const t of db.transactions) assert.equal(t.ops[0], 'lock:store_settings', `tx ${t.id}: kunci sebelum membaca metode`);
}

test('hanya Owner: tamu 401, pelanggan & Staf 403; tanpa transaksi', async () => {
  assert.equal((await patch('gopay', { is_active: false }, null)).status, 401);
  assert.equal((await patch('gopay', { is_active: false }, tokenFor('1'))).status, 403);
  assert.equal((await patch('gopay', { is_active: false }, tokenFor('3'))).status, 403);
  assert.equal(db.transactions.length, 0);
  assert.deepEqual(db.committed, seedTables());
});

test('nonaktifkan metode (masih ada online lain) → 200 kontrak mock; kunci → baca → UPDATE → baca ulang', async () => {
  const { status, json } = await patch('gopay', { is_active: false });
  assert.deepEqual([status, json.data], [200, { method_code: 'gopay', is_active: false }]);
  assert.equal(activeOf('gopay'), false);
  assert.deepEqual(db.transactions[0].ops, ['lock:store_settings', 'paymentMethod.findMany', 'paymentMethod.updateMany', 'paymentMethod.findUnique']);
  assertCleanTx();
});

test('aktifkan metode nonaktif → 200; Bayar di Toko boleh dinonaktifkan', async () => {
  assert.deepEqual((await patch('ovo', { is_active: true })).json.data, { method_code: 'ovo', is_active: true });
  assert.equal(activeOf('ovo'), true);
  assert.deepEqual((await patch('pay_at_store', { is_active: false })).json.data, { method_code: 'pay_at_store', is_active: false });
  assert.equal(activeOf('pay_at_store'), false);
  assertCleanTx();
});

test('idempoten: aktifkan yang sudah aktif / nonaktifkan yang sudah nonaktif → 200 tanpa UPDATE', async () => {
  for (const [code, isActive] of [['qris', true], ['ovo', false], ['pay_at_store', true]]) {
    db.reset();
    const { status, json } = await patch(code, { is_active: isActive });
    assert.deepEqual([status, json.data], [200, { method_code: code, is_active: isActive }]);
    assert.deepEqual(db.transactions[0].ops, ['lock:store_settings', 'paymentMethod.findMany']);
    assert.deepEqual(db.committed, seedTables());
  }
  assertCleanTx();
});

test('metode online aktif terakhir → 409 tanpa UPDATE (BR-05)', async () => {
  assert.equal((await patch('gopay', { is_active: false })).status, 200); // tinggal QRIS
  const { status, json } = await patch('qris', { is_active: false });
  assert.deepEqual([status, json.message, json.fieldErrors], [409, LAST_ONLINE, undefined]);
  assert.equal(activeOf('qris'), true);
  assert.deepEqual(db.transactions[1].ops, ['lock:store_settings', 'paymentMethod.findMany']);
  assert.equal(db.transactions[1].committed, false); // dilempar dari dalam transaksi → rollback
  assertCleanTx();
});

test('metode tidak ditemukan → 404; kode/body tidak sah → 400 tanpa transaksi', async () => {
  const missing = await patch('gopay_x', { is_active: true });
  assert.deepEqual([missing.status, missing.json.message], [404, 'Metode bayar tidak ditemukan']);
  assert.equal(db.transactions.length, 1);

  for (const [code, body, message] of [
    ['QRIS', { is_active: true }, 'Kode metode bayar tidak valid.'],
    ['va-bca', { is_active: true }, 'Kode metode bayar tidak valid.'],
    ['a'.repeat(21), { is_active: true }, 'Kode metode bayar tidak valid.'],
    ['qris', { is_active: 'false' }, 'Status aktif tidak valid.'],
    ['qris', {}, 'Status aktif tidak valid.'],
  ]) {
    const res = await patch(code, body);
    assert.deepEqual([res.status, res.json.message], [400, message], code);
  }
  assert.equal(db.transactions.length, 1); // tidak bertambah
  assert.deepEqual(db.committed, seedTables());
});

test('dua Owner bersamaan menonaktifkan dua metode online terakhir → tepat satu 200, satu 409, tetap ≥ 1 online aktif', async () => {
  for (let round = 0; round < 10; round += 1) {
    db.reset();
    // Pemegang kunci ditahan sejenak agar request kedua benar-benar menunggu kunci (bukan berurutan kebetulan)
    db.afterLock = () => new Promise((resolve) => setTimeout(resolve, 15));
    const order = round % 2 ? ['gopay', 'qris'] : ['qris', 'gopay'];
    const results = await Promise.all([patch(order[0], { is_active: false }, tokenFor('4')), patch(order[1], { is_active: false }, tokenFor('6'))]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409], `putaran ${round}`);
    assert.equal(results.find((r) => r.status === 409).json.message, LAST_ONLINE);
    assert.equal(activeOnline().length, 1, `putaran ${round}: tersisa satu metode online aktif`);
    assert.equal(db.lockWaits, 1, `putaran ${round}: request kedua menunggu kunci`);
    assertCleanTx();
  }
});

test('bersamaan dengan metode online lain tersedia → keduanya 200 (serialisasi tidak menolak perubahan sah)', async () => {
  db.committed.paymentMethods.find((m) => m.methodCode === 'va_bca').isActive = true;
  db.afterLock = () => new Promise((resolve) => setTimeout(resolve, 15));
  const results = await Promise.all([patch('qris', { is_active: false }), patch('gopay', { is_active: false }, tokenFor('6'))]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.deepEqual(activeOnline(), ['va_bca']);
  assertCleanTx();
});

test('gagal saat UPDATE → 500 & rollback (status metode tidak berubah)', async () => {
  db.failOn = (op) => op === 'paymentMethod.updateMany';
  const original = console.error;
  console.error = () => {};
  try {
    const res = await patch('gopay', { is_active: false });
    assert.deepEqual([res.status, res.json.message], [500, 'Terjadi kesalahan pada server.']);
  } finally {
    console.error = original;
  }
  assert.equal(activeOf('gopay'), true);
  assert.deepEqual(db.committed, seedTables());
});

// ---------------------------------------------------------------- L-1 (review C2): count UPDATE & baca ulang

const NOT_UPDATED = 'Metode bayar gagal diperbarui karena data berubah. Muat ulang halaman lalu coba lagi.';

test('L-1: UPDATE mengenai tepat 1 baris → respons dari baca ulang lewat tx; urutan kunci → baca → UPDATE → baca ulang', async () => {
  const reads = [];
  db.transformRead = (op, result) => { reads.push(op); return result; };
  const { status, json } = await patch('ovo', { is_active: true });
  assert.deepEqual([status, json.data], [200, { method_code: 'ovo', is_active: true }]);
  const [tx] = db.transactions;
  assert.deepEqual(tx.ops, ['lock:store_settings', 'paymentMethod.findMany', 'paymentMethod.updateMany', 'paymentMethod.findUnique']);
  assert.deepEqual(reads, ['paymentMethod.findMany', 'paymentMethod.findUnique']);
  assert.equal(tx.committed, true);
  assertCleanTx();
});

test('L-1: UPDATE count 0 → 409 tanpa sukses palsu, rollback, tanpa baca ulang', async () => {
  db.forceCount = { 'paymentMethod.updateMany': 0 };
  const { status, json } = await patch('gopay', { is_active: false });
  assert.deepEqual([status, json.message, json.data], [409, NOT_UPDATED, undefined]);
  assert.deepEqual(db.transactions[0].ops, ['lock:store_settings', 'paymentMethod.findMany', 'paymentMethod.updateMany']);
  assert.equal(db.transactions[0].committed, false);
  assert.equal(activeOf('gopay'), true);
  assert.deepEqual(db.committed, seedTables());
  assertCleanTx();
});

test('L-1: hasil baca ulang tidak sesuai tujuan / baris hilang → 409 (respons tidak disusun dari input request)', async () => {
  for (const tamper of [(row) => ({ ...row, isActive: true }), () => null]) {
    db.reset();
    db.transformRead = (op, result) => (op === 'paymentMethod.findUnique' ? tamper(result) : result);
    const { status, json } = await patch('gopay', { is_active: false });
    assert.deepEqual([status, json.message], [409, NOT_UPDATED]);
    assert.equal(db.transactions[0].committed, false);
    assert.equal(activeOf('gopay'), true); // rollback: UPDATE yang sempat terjadi dibatalkan
  }
  assertCleanTx();
});

test('L-1: jalur idempoten tidak menulis & respons dari baris yang dibaca setelah kunci', async () => {
  const { status, json } = await patch('qris', { is_active: true });
  assert.deepEqual([status, json.data], [200, { method_code: 'qris', is_active: true }]);
  assert.deepEqual(db.transactions[0].ops, ['lock:store_settings', 'paymentMethod.findMany']);
  assert.deepEqual(db.committed, seedTables());
});

test('L-1: method_code di respons = nilai tersimpan hasil baca ulang (collation MySQL _ci bisa menyimpan bentuk lain)', async () => {
  // Meniru baris yang tersimpan dengan bentuk kanonik berbeda (mis. huruf besar); validator request hanya huruf kecil
  db.transformRead = (op, result) => (op === 'paymentMethod.findUnique' && result ? { ...result, methodCode: 'GOPAY' } : result);
  const { status, json } = await patch('gopay', { is_active: false });
  assert.deepEqual([status, json.data], [200, { method_code: 'GOPAY', is_active: false }]);
  assert.equal(db.transactions[0].committed, true);
});
