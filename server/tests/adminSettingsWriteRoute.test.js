// Regresi tingkat HTTP Step 6.4.10 C2: PUT /api/admin/settings & PUT /api/admin/settings/operating-hours
// (FR-36 · UC-30 · A-11 · BR-02 · BR-12 · TF-10 · AD-11). Rangkaian penuh HTTP → zod → normalisasi → validasi → Prisma:
// hanya Owner; validasi sebelum transaksi (input tidak sah tidak membuka transaksi & tidak menulis); presisi M1 (nilai
// tertulis = teks kanonik yang divalidasi); kunci store_settings sebagai operasi pertama, query berurutan lewat `tx`;
// rollback tanpa perubahan parsial. Fake: tests/helpers/settingsDb.js (kunci & read view ala InnoDB).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installSettingsDb, seedTables, time } = require('./helpers/settingsDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
};
const db = installSettingsDb(fakePrisma, users);

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/settings`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => db.reset());

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
async function put(path, body, token = tokenFor('4')) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const quiet = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
};

// Body persis seperti StoreProfileForm (semua nilai teks)
const FORM = {
  store_name: 'Oven & Co. Kemang', address: 'Jl. Kemang Raya No. 8, Jakarta Selatan', whatsapp_number: '+62 812 1111 2222',
  preorder_cutoff_time: '16:30', delivery_radius_km: '1.150', delivery_fee_per_km: '2500.00',
};
const UNTOUCHED = ['settingId', 'latitude', 'longitude', 'paymentTimeoutMinutes', 'earnAmountPerPoint', 'redeemPointsUnit',
  'redeemValue', 'goldMinPoints', 'platinumMinPoints', 'reviewBonusPoints'];

/** Tidak ada transaksi tulis yang commit dan data sama dengan seed */
function assertNoWrite() {
  assert.ok(db.transactions.every((t) => !t.committed || t.writes.length === 0), 'tidak ada tulisan ter-commit');
  assert.deepEqual(db.committed, seedTables());
}
function assertCleanTx() {
  assert.deepEqual(db.violations, []);
  assert.deepEqual(db.globalCalls, []);
  for (const t of db.transactions) assert.equal(t.ops[0], 'lock:store_settings', `tx ${t.id}: kunci = operasi pertama`);
}

// ---------------------------------------------------------------- PUT /api/admin/settings (profil)

test('profil: hanya Owner — tamu 401, pelanggan & Staf 403; tanpa transaksi', async () => {
  assert.equal((await put('', FORM, null)).status, 401);
  assert.equal((await put('', FORM, tokenFor('1'))).status, 403);
  assert.equal((await put('', FORM, tokenFor('3'))).status, 403);
  assert.equal(db.transactions.length, 0);
  assertNoWrite();
});

test('profil: tersimpan lewat kunci store_settings; 6 kolom saja; nilai tertulis = teks kanonik M1; respons kontrak mock', async () => {
  const { status, json } = await put('', FORM);
  assert.equal(status, 200);
  assert.deepEqual(json.data, {
    store_name: 'Oven & Co. Kemang', address: 'Jl. Kemang Raya No. 8, Jakarta Selatan', whatsapp_number: '+6281211112222',
    preorder_cutoff_time: '16:30', delivery_radius_km: 1.15, delivery_fee_per_km: 2500,
  });
  assert.equal(db.transactions.length, 1);
  const [tx] = db.transactions;
  assert.deepEqual(tx.ops, ['lock:store_settings', 'storeSetting.updateMany', 'storeSetting.findFirst']);
  assert.deepEqual(Object.keys(tx.lastData).sort(), ['address', 'deliveryFeePerKm', 'deliveryRadiusKm', 'preorderCutoffTime', 'storeName', 'whatsappNumber']);
  // Teks kanonik persis (bukan number hasil Number(), bukan teks mentah form)
  assert.equal(tx.lastData.deliveryRadiusKm, '1.15');
  assert.equal(tx.lastData.deliveryFeePerKm, '2500');
  assert.equal(tx.lastData.preorderCutoffTime.toISOString(), '1970-01-01T16:30:00.000Z');
  const saved = db.committed.storeSetting;
  assert.equal(saved.deliveryRadiusKm, '1.15');
  assert.equal(saved.whatsappNumber, '+6281211112222');
  for (const key of UNTOUCHED) assert.deepEqual(saved[key], seedTables().storeSetting[key], key); // koordinat dll. tetap
  assertCleanTx();
});

test('profil M1 lewat HTTP: "1.150" & "2500.00" diterima; "10.0000000000000001" & "2500.0000000000000001" ditolak tanpa UPDATE', async () => {
  const accepted = await put('', { ...FORM, delivery_radius_km: '1.150', delivery_fee_per_km: '2500.00' });
  assert.equal(accepted.status, 200);
  assert.deepEqual([db.committed.storeSetting.deliveryRadiusKm, db.committed.storeSetting.deliveryFeePerKm], ['1.15', '2500']);

  for (const [field, value, message] of [
    ['delivery_radius_km', '10.0000000000000001', 'Radius maks. 999.99 km dengan 2 desimal'],
    ['delivery_fee_per_km', '2500.0000000000000001', 'Tarif berupa bilangan bulat rupiah ≥ 0'],
    ['delivery_radius_km', '1.149', 'Radius maks. 999.99 km dengan 2 desimal'],
    ['delivery_fee_per_km', '2500.01', 'Tarif berupa bilangan bulat rupiah ≥ 0'],
  ]) {
    db.reset();
    const res = await put('', { ...FORM, [field]: value });
    assert.equal(res.status, 400, `${field}=${value}`);
    assert.equal(res.json.message, message);
    assert.deepEqual(res.json.fieldErrors, { [field]: message });
    assert.equal(db.transactions.length, 0, 'validasi gagal → transaksi tidak dibuka');
    assertNoWrite();
  }
});

test('profil: angka JSON (number) juga diterima & ditulis sebagai teks kanonik', async () => {
  const { status, json } = await put('', { ...FORM, delivery_radius_km: 7.25, delivery_fee_per_km: 3000 });
  assert.equal(status, 200);
  assert.deepEqual([json.data.delivery_radius_km, json.data.delivery_fee_per_km], [7.25, 3000]);
  assert.deepEqual([db.transactions[0].lastData.deliveryRadiusKm, db.transactions[0].lastData.deliveryFeePerKm], ['7.25', '3000']);
});

test('profil: isian wajib/format salah → 400 pesan pertama + fieldErrors (mock); tanpa transaksi', async () => {
  const { status, json } = await put('', { ...FORM, store_name: ' ', whatsapp_number: '0812', preorder_cutoff_time: '24:00', delivery_radius_km: '0' });
  assert.equal(status, 400);
  assert.equal(json.message, 'Isi nama toko');
  assert.deepEqual(Object.keys(json.fieldErrors).sort(), ['delivery_radius_km', 'preorder_cutoff_time', 'store_name', 'whatsapp_number']);
  assert.equal(db.transactions.length, 0);
  assertNoWrite();
});

test('profil: bentuk salah → 400 tanpa fieldErrors; field di luar kontrak (koordinat, batas bayar, bonus ulasan) diabaikan', async () => {
  for (const body of [{ ...FORM, store_name: 5 }, { ...FORM, delivery_fee_per_km: true }, [], '{rusak']) {
    const res = await put('', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.json.fieldErrors, undefined);
  }
  assert.equal(db.transactions.length, 0);
  assertNoWrite();

  const res = await put('', { ...FORM, latitude: 0, longitude: 0, payment_timeout_minutes: 1, review_bonus_points: 999, earn_amount_per_point: 1 });
  assert.equal(res.status, 200);
  for (const key of UNTOUCHED) assert.deepEqual(db.committed.storeSetting[key], seedTables().storeSetting[key], key);
});

test('profil: gagal di tengah transaksi → 500 umum & rollback (data tetap seed)', async () => {
  db.failOn = (op) => op === 'storeSetting.findFirst'; // setelah UPDATE
  const res = await quiet(() => put('', FORM));
  assert.deepEqual([res.status, res.json.message], [500, 'Terjadi kesalahan pada server.']);
  assert.equal(db.transactions[0].committed, false);
  assert.deepEqual(db.committed, seedTables());
});

// ---------------------------------------------------------------- PUT /api/admin/settings/operating-hours

const week = (patch = {}) => [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_of_week: d, is_open: true, open_time: '08:00', close_time: '21:00', ...(patch[d] ?? {}) }));
const HOURS_DAYS_TEXT = 'Jam operasional wajib berisi 7 hari berbeda (Senin–Minggu).';

test('jam: hanya Owner; tanpa transaksi untuk Staf/pelanggan', async () => {
  assert.equal((await put('/operating-hours', { hours: week() }, tokenFor('3'))).status, 403);
  assert.equal((await put('/operating-hours', { hours: week() }, tokenFor('1'))).status, 403);
  assert.equal(db.transactions.length, 0);
});

test('jam: 7 hari lengkap (acak urutan) tersimpan; hari tutup dengan jam terisi → disimpan & dikirim null', async () => {
  const hours = week({ 6: { open_time: '09:30', close_time: '15:00' }, 7: { is_open: false, open_time: '07:00', close_time: '20:00' } }).reverse();
  const { status, json } = await put('/operating-hours', { hours });
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((h) => h.day_of_week), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(json.data[0], { hour_id: 1, day_of_week: 1, open_time: '08:00', close_time: '21:00', is_open: true });
  assert.deepEqual(json.data[5], { hour_id: 6, day_of_week: 6, open_time: '09:30', close_time: '15:00', is_open: true });
  assert.deepEqual(json.data[6], { hour_id: 7, day_of_week: 7, open_time: null, close_time: null, is_open: false });
  const sunday = db.committed.operatingHours.find((h) => h.dayOfWeek === 7);
  assert.deepEqual([sunday.isOpen, sunday.openTime, sunday.closeTime], [false, null, null]); // DB: jam null untuk hari tutup
  assert.equal(db.committed.operatingHours.find((h) => h.dayOfWeek === 1).openTime.toISOString(), '1970-01-01T08:00:00.000Z');
  const [tx] = db.transactions;
  // kunci → baca semua baris (deteksi konflik) → 7 UPDATE berurutan menurut hari → baca ulang
  assert.deepEqual(tx.ops, ['lock:store_settings', 'operatingHour.findMany', ...Array(7).fill('operatingHour.update'), 'operatingHour.findMany']);
  assert.deepEqual(tx.hourWrites.map((w) => `${w.op}:${w.day}`), [1, 2, 3, 4, 5, 6, 7].map((d) => `update:${d}`));
  assertCleanTx();
});

test('jam: hari duplikat, hari hilang, hari di luar 1–7, kelebihan hari → 400 tanpa transaksi', async () => {
  for (const hours of [
    week({ 7: { day_of_week: 1 } }), // duplikat
    week().slice(0, 6), // hari hilang
    week({ 7: { day_of_week: 0 } }),
    [...week(), { day_of_week: 1, is_open: false, open_time: null, close_time: null }],
    undefined,
  ]) {
    const res = await put('/operating-hours', { hours });
    assert.deepEqual([res.status, res.json.message], [400, HOURS_DAYS_TEXT]);
  }
  assert.equal(db.transactions.length, 0);
  assertNoWrite();
});

test('jam: jam tidak valid, tutup ≤ buka, semua hari tutup → 400 fieldErrors per hari (mock); tanpa transaksi', async () => {
  const invalid = await put('/operating-hours', { hours: week({ 2: { open_time: '25:00' }, 3: { close_time: '' }, 4: { open_time: null } }) });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.json.fieldErrors, { 2: 'Isi jam buka dan jam tutup', 3: 'Isi jam buka dan jam tutup', 4: 'Isi jam buka dan jam tutup' });

  const order = await put('/operating-hours', { hours: week({ 1: { open_time: '21:00', close_time: '21:00' }, 5: { open_time: '22:00', close_time: '07:00' } }) });
  assert.equal(order.status, 400);
  assert.equal(order.json.message, 'Jam tutup harus setelah jam buka');
  assert.deepEqual(order.json.fieldErrors, { 1: 'Jam tutup harus setelah jam buka', 5: 'Jam tutup harus setelah jam buka' });

  const closed = await put('/operating-hours', { hours: week(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { is_open: false }]))) });
  assert.deepEqual([closed.status, closed.json.fieldErrors], [400, { all: 'Minimal satu hari toko buka' }]);

  const shape = await put('/operating-hours', { hours: week({ 2: { is_open: 'ya' } }) });
  assert.deepEqual([shape.status, shape.json.fieldErrors], [400, undefined]);
  assert.equal(db.transactions.length, 0);
  assertNoWrite();
});

test('jam: gagal di hari ke-5 → 500 & rollback penuh (hari 1–4 tidak tersimpan)', async () => {
  db.failOn = (op, args) => op === 'operatingHour.update' && args.where.dayOfWeek === 5;
  const res = await quiet(() => put('/operating-hours', { hours: week({ 7: { is_open: false } }) }));
  assert.equal(res.status, 500);
  const [tx] = db.transactions;
  assert.equal(tx.ops.filter((op) => op === 'operatingHour.update').length, 5); // hari 1–5 dicoba, berurutan
  assert.deepEqual(tx.hourWrites.map((w) => w.day), [1, 2, 3, 4]); // hari 1–4 sempat ditulis di transaksi
  assert.equal(tx.committed, false);
  assert.deepEqual(db.committed.operatingHours, seedTables().operatingHours);
});

test('jam: baris hari yang belum ada di DB dibuat dengan hour_id = day_of_week', async () => {
  db.committed.operatingHours = db.committed.operatingHours.filter((h) => h.dayOfWeek !== 4);
  const { status, json } = await put('/operating-hours', { hours: week() });
  assert.equal(status, 200);
  assert.deepEqual(json.data.find((h) => h.day_of_week === 4), { hour_id: 4, day_of_week: 4, open_time: '08:00', close_time: '21:00', is_open: true });
  assert.equal(db.committed.operatingHours.length, 7);
  const created = db.transactions[0].hourWrites.filter((w) => w.op === 'create');
  assert.deepEqual(created.map((w) => w.data), [{ hourId: 4, dayOfWeek: 4, isOpen: true, openTime: time('08:00'), closeTime: time('21:00') }]);
  assert.equal(db.transactions[0].hourWrites.filter((w) => w.op === 'update').length, 6);
  assertCleanTx();
});

test('profil & jam bersamaan: diserialkan oleh kunci store_settings (yang kedua menunggu), keduanya tersimpan utuh', async () => {
  db.afterLock = () => new Promise((resolve) => setTimeout(resolve, 20));
  const [profile, hours] = await Promise.all([put('', FORM), put('/operating-hours', { hours: week() })]);
  assert.deepEqual([profile.status, hours.status], [200, 200]);
  assert.equal(db.lockWaits, 1);
  assert.equal(db.committed.storeSetting.storeName, 'Oven & Co. Kemang');
  assert.ok(db.committed.operatingHours.every((h) => h.openTime.toISOString() === '1970-01-01T08:00:00.000Z'));
  assertCleanTx();
});

// ---------------------------------------------------------------- L-2 & L-3 (review C2): data lama operating_hours

const snapshotHours = () => structuredClone(db.committed.operatingHours);

test('L-2: hari belum ada & hour_id = day_of_week dipakai baris hari lain → 409 jelas, tanpa tulis, data utuh', async () => {
  db.committed.operatingHours = db.committed.operatingHours.filter((h) => h.dayOfWeek !== 4);
  db.committed.operatingHours.find((h) => h.dayOfWeek === 6).hourId = 4; // data lama: hari 6 memakai hour_id 4
  const before = snapshotHours();
  const { status, json } = await put('/operating-hours', { hours: week({ 7: { is_open: false } }) });
  assert.equal(status, 409);
  assert.equal(json.message, 'Data jam operasional tidak konsisten: hari 4 (hour_id 4 dipakai baris day_of_week 6). '
    + 'Perbaiki tabel operating_hours (hour_id = day_of_week untuk hari 1–7), lalu simpan ulang.');
  const [tx] = db.transactions;
  assert.deepEqual(tx.ops, ['lock:store_settings', 'operatingHour.findMany']); // terdeteksi setelah kunci, sebelum menulis
  assert.deepEqual(tx.hourWrites, []);
  assert.equal(tx.committed, false);
  assert.deepEqual(db.committed.operatingHours, before);
  assertCleanTx();
});

test('L-2: konflik dengan baris lama di luar 1–7 juga terdeteksi; beberapa konflik disebut semua', async () => {
  db.committed.operatingHours = db.committed.operatingHours.filter((h) => ![2, 5].includes(h.dayOfWeek));
  db.committed.operatingHours.push({ hourId: 2, dayOfWeek: 9, openTime: null, closeTime: null, isOpen: false });
  db.committed.operatingHours.push({ hourId: 5, dayOfWeek: 0, openTime: null, closeTime: null, isOpen: false });
  const before = snapshotHours();
  const { status, json } = await put('/operating-hours', { hours: week() });
  assert.equal(status, 409);
  assert.match(json.message, /hari 2 \(hour_id 2 dipakai baris day_of_week 9\), hari 5 \(hour_id 5 dipakai baris day_of_week 0\)/);
  assert.deepEqual(db.committed.operatingHours, before);
});

test('L-2: P2002 lain dari database TIDAK dipetakan menjadi 409 (tetap 500 umum) & rollback penuh', async () => {
  db.committed.operatingHours = db.committed.operatingHours.filter((h) => h.dayOfWeek !== 4); // hari 4 akan dibuat
  const before = snapshotHours();
  db.failOn = (op) => (op === 'operatingHour.create' ? Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) : false);
  const res = await quiet(() => put('/operating-hours', { hours: week() }));
  assert.deepEqual([res.status, res.json.message], [500, 'Terjadi kesalahan pada server.']);
  assert.equal(db.transactions[0].hourWrites.filter((w) => w.op === 'update').length, 6); // 6 UPDATE sempat ditulis …
  assert.deepEqual(db.committed.operatingHours, before); // … lalu dibatalkan
});

test('L-3: PUT dengan baris lama hari ke-8 → respons tepat 7 hari sah; baris hari ke-8 tidak dihapus/diubah', async () => {
  const legacy = { hourId: 8, dayOfWeek: 8, openTime: time('06:00'), closeTime: time('23:00'), isOpen: true };
  db.committed.operatingHours.push(structuredClone(legacy));
  const { status, json } = await put('/operating-hours', { hours: week({ 7: { is_open: false } }) });
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((h) => h.day_of_week), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(db.committed.operatingHours.find((h) => h.dayOfWeek === 8), legacy);
  assert.equal(db.committed.operatingHours.length, 8);
  for (const d of [1, 2, 3, 4, 5, 6]) {
    const h = db.committed.operatingHours.find((r) => r.dayOfWeek === d);
    assert.deepEqual([h.isOpen, h.openTime.toISOString(), h.closeTime.toISOString()], [true, '1970-01-01T08:00:00.000Z', '1970-01-01T21:00:00.000Z']);
  }
  assert.deepEqual(db.committed.operatingHours.find((h) => h.dayOfWeek === 7), { hourId: 7, dayOfWeek: 7, isOpen: false, openTime: null, closeTime: null });
  assert.ok(db.transactions[0].hourWrites.every((w) => w.day >= 1 && w.day <= 7));
  assertCleanTx();
});
