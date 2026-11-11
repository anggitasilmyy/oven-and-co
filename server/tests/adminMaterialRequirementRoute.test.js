// CR-03 CP5 · FR-40 · UC-32 · BR-14 – BR-16 · AD-07 — GET /api/admin/material-requirements tingkat HTTP (Prisma
// dipalsukan, helpers/materialRequirementDb.js — BUKAN bukti filter/snapshot MySQL; lihat
// tests-mysql/18-material-requirements.it.test.js). Skenario = CR-03 §B3.6 (hari ini Rab 11 Nov 2026 WIB).
// AC-40.1 – AC-40.8 (AC-40.9 rekonsiliasi kalender diuji di MySQL), batas tanggal, otorisasi, MILLI_PRECISION_LOST.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installMaterialRequirementDb, dbDate } = require('./helpers/materialRequirementDb');
const { B36_EXPECTED, b36Input } = require('./helpers/recipeFixtures');
const { computeMaterialRequirements } = require('../src/services/materialRequirementRules.service');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

const NOON_WIB = new Date('2026-11-11T05:00:00.000Z');
let db;
let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/material-requirements`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach((t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON_WIB });
  db = installMaterialRequirementDb(fakePrisma);
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (query = '', token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, text: await res.text() };
};
const getJson = async (query, token) => {
  const res = await call(query, token);
  return { status: res.status, json: JSON.parse(res.text), text: res.text };
};
const butter = (data) => data.rows.find((r) => r.material_id === '2');

test('otorisasi: tanpa token 401, pelanggan 403, Staf & Owner 200', async () => {
  assert.equal((await call('', null)).status, 401);
  assert.equal((await call('', tokenFor('1'))).status, 403);
  assert.equal((await call('', tokenFor('3'))).status, 200);
  assert.equal((await call('', tokenFor('4'))).status, 200);
  db.t.users[3].isActive = false;
  assert.equal((await call('', tokenFor('3'))).status, 401);
});

test('kontrak B7.3: respons = hasil aturan murni CP3 apa adanya (tanpa perhitungan kedua)', async () => {
  for (const date of ['2026-11-11', '2026-11-12', '2026-11-14', '2026-12-10']) {
    const res = await getJson(`?date=${date}`);
    assert.equal(res.status, 200, date);
    assert.equal(res.json.status, 'success');
    const expected = computeMaterialRequirements(b36Input(date, {
      productNames: { 1: 'Classic Butter Croissant', 4: 'Assorted Cookies Box', 5: 'Premium Birthday Cake', 6: 'Custom Celebration Cake' },
    }));
    assert.deepEqual(res.json.data, JSON.parse(JSON.stringify(expected)), date);
  }
});

test('AC-40.1 – AC-40.7: angka §B3.6 per tanggal (harian, tertunggak, kumulatif, sisa, status) + ringkasan', async () => {
  for (const [date, exp] of Object.entries(B36_EXPECTED)) {
    const { json } = await getJson(`?date=${date}`);
    const row = butter(json.data);
    assert.deepEqual(
      { daily_need: row.daily_need, backlog_need: row.backlog_need, cumulative_need: row.cumulative_need, remaining: row.remaining, shortage: row.shortage, status: row.status },
      exp, date,
    );
    assert.deepEqual(json.data.cumulative_range, { from: '2026-11-11', to: date });
    assert.equal(json.data.includes_ready_plan, true);
  }
  // Tepung tanpa komposisi produk mana pun → kebutuhan 0, status dari stok saja (42 > 25 → cukup)
  const { json } = await getJson('?date=2026-11-11');
  assert.deepEqual(json.data.rows.map((r) => [r.material_id, r.status]), [['2', 'menipis'], ['1', 'cukup']]);
  assert.deepEqual(json.data.summary, { kurang: 0, menipis: 1, cukup: 1 });
  assert.deepEqual(butter(json.data), {
    material_id: '2', name: 'Butter Prancis', unit: 'kg', stock: 6.5, min_stock: 8,
    daily_need: 0.85, backlog_need: 0.25, cumulative_need: 1.1, remaining: 5.4, shortage: 0, status: 'menipis',
  });
});

test('produk ready: qty_planned HARI INI saja; tanggal mendatang tanpa kontribusi ready (E-3)', async () => {
  const today = butter((await getJson('?date=2026-11-11')).json.data);
  const tomorrow = butter((await getJson('?date=2026-11-12')).json.data);
  // hari ini: 40 × 0,015 = 0,6 (rencana besok 99 & kemarin 77 diabaikan) + P2 0,25 = 0,85
  assert.equal(today.daily_need, 0.85);
  assert.equal(tomorrow.daily_need, 0.75, 'P1 2×0,25 + P9 cake 0,25; croissant P9 & rencana besok tidak dihitung');
});

test('status kurang: stok < kebutuhan kumulatif → sisa negatif, kekurangan positif, urutan kurang dahulu', async () => {
  db.t.materials[1].stock = '1.00';
  const { json } = await getJson('?date=2026-11-12');
  assert.deepEqual(json.data.rows.map((r) => r.status), ['kurang', 'cukup']);
  assert.deepEqual([butter(json.data).remaining, butter(json.data).shortage], [-0.85, 0.85]);
  assert.deepEqual(json.data.summary, { kurang: 1, menipis: 0, cukup: 1 });
});

test('produk tanpa komposisi: masuk products_without_recipe, TIDAK dianggap nol diam-diam', async () => {
  const { json } = await getJson('?date=2026-11-11');
  assert.deepEqual(json.data.products_without_recipe, [
    { product_id: '4', name: 'Assorted Cookies Box', daily_quantity: 12, cumulative_quantity: 12 },
  ]);
  // komposisi birthday cake dihapus → produk 5 ikut terdaftar; kebutuhan butter turun hanya sebesar kontribusinya
  db.t.productMaterials = db.t.productMaterials.filter((r) => r.productId !== 5n);
  const after = (await getJson('?date=2026-11-12')).json.data;
  assert.deepEqual(after.products_without_recipe.map((p) => [p.product_id, p.name, p.daily_quantity, p.cumulative_quantity]),
    [['4', 'Assorted Cookies Box', 0, 12], ['5', 'Premium Birthday Cake', 3, 5]]);
  assert.equal(butter(after).cumulative_need, 0.6);
});

test('status pesanan: hanya dikonfirmasi & sedang_disiapkan; filter dikirim ke basis data', async () => {
  await getJson('?date=2026-11-14');
  const where = db.lastOrderItemWhere;
  assert.deepEqual(where.order.is.orderStatus.in, ['dikonfirmasi', 'sedang_disiapkan']);
  assert.deepEqual(where.order.is.readyDate.lte, dbDate('2026-11-14'));
  assert.deepEqual(where.product.is.availabilityType.in, ['preorder', 'custom']);
});

test('tanggal: kosong = hari ini WIB; batas T dan T+29 diterima; di luar & tidak valid → 400 tanpa membaca DB', async () => {
  assert.equal((await getJson('')).json.data.date, '2026-11-11');
  assert.equal((await getJson('?date=')).json.data.date, '2026-11-11');
  const last = await getJson('?date=2026-12-10');
  assert.deepEqual([last.status, last.json.data.window], [200, { from: '2026-11-11', to: '2026-12-10' }]);
  db.ops.length = 0;
  for (const [q, msg] of [
    ['?date=2026-11-10', 'Tanggal di luar rentang.'], ['?date=2026-12-11', 'Tanggal di luar rentang.'],
    ['?date=2026-02-30', 'Tanggal tidak valid.'], ['?date=11-11-2026', 'Tanggal tidak valid.'],
    ['?date=2026-11-11T00:00', 'Tanggal tidak valid.'], ['?date=abc', 'Tanggal tidak valid.'],
    ['?date=2026-11-11&date=2026-11-12', 'Tanggal tidak valid.'], ['?date[x]=1', 'Tanggal tidak valid.'],
  ]) {
    const res = await getJson(q);
    assert.deepEqual([res.status, res.json.status, res.json.message], [400, 'error', msg], q);
  }
  assert.deepEqual(db.ops, [], 'validasi tanggal sebelum snapshot');
});

test('hari ini mengikuti WIB, bukan UTC: 10 Nov 17:00 UTC = 11 Nov 00:00 WIB', async (t) => {
  t.mock.timers.setTime(Date.parse('2026-11-10T17:00:00.000Z'));
  assert.equal((await getJson('')).json.data.today_key, '2026-11-11');
  t.mock.timers.setTime(Date.parse('2026-11-10T16:59:59.000Z'));
  const { json } = await getJson('');
  assert.deepEqual([json.data.today_key, json.data.window.to], ['2026-11-10', '2026-12-09']);
});

test('AC-40.8 / BR-15: satu snapshot REPEATABLE READ, hanya baca (tanpa tulis, tanpa audit)', async () => {
  await getJson('?date=2026-11-14');
  assert.equal(db.ops.filter((o) => o === 'tx:begin').length, 1);
  assert.equal(db.ops[0], 'tx:begin');
  assert.equal(db.txOptions.isolationLevel, 'RepeatableRead');
  assert.ok(!db.ops.some((o) => o.startsWith('WRITE:')), db.ops.join(','));
});

test('MILLI_PRECISION_LOST → 500 + kode + pesan aman; tanpa data/angka terpotong; detail hanya di log', async (t) => {
  db.t.dailyStocks.push({ productId: 7n, stockDate: dbDate('2026-11-11'), qtyPlanned: 2147483647 });
  db.t.products.find((p) => p.productId === 7n).availabilityType = 'ready';
  db.t.productMaterials.push({ productId: 7n, materialId: 1n, qtyPerUnit: '9999999.999' });
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const res = await getJson('?date=2026-11-11');
  assert.equal(res.status, 500);
  assert.deepEqual(res.json, { status: 'error', code: 'MILLI_PRECISION_LOST', message: 'Hasil perhitungan tidak dapat direpresentasikan secara aman.' });
  assert.ok(!/rows|remaining|\d{10,}/.test(res.text), 'tidak ada data perhitungan di respons');
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], '[API Error] MILLI_PRECISION_LOST');
  assert.equal(String(logged[0][1].milli), String(2147483647n * 9999999999n), 'nilai milli lengkap tercatat di log server');
  // kumulatif tanggal mendatang juga memuat rencana hari ini → tetap 500 (tidak ada hasil parsial)
  assert.equal((await getJson('?date=2026-11-12')).status, 500);
  // tanpa nilai ekstrem → normal kembali
  db.t.dailyStocks.pop();
  assert.equal((await getJson('?date=2026-11-11')).status, 200);
});

test('error 500 lain tetap tanpa kode & pesan generik (pemetaan presisi tidak bocor ke error lain)', async (t) => {
  t.mock.method(console, 'error', () => {});
  db.failOn = 'rawMaterial.findMany';
  const res = await getJson('?date=2026-11-11');
  assert.deepEqual([res.status, res.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
});

test('AC-40.7: tanpa pembulatan — 7 × 0,015 = 0,105; stok 0,10 → kekurangan 0,005 tampil apa adanya', async () => {
  db.t.orderItems = [{ productId: 5n, quantity: 7, orderStatus: 'dikonfirmasi', readyDate: dbDate('2026-11-11') }];
  db.t.dailyStocks = [];
  db.t.productMaterials = [{ productId: 5n, materialId: 2n, qtyPerUnit: '0.015' }];
  db.t.materials[1] = { ...db.t.materials[1], stock: '0.10', minStock: '0.00' };
  const res = await call('?date=2026-11-11');
  assert.match(res.text, /"daily_need":0\.105,"backlog_need":0,"cumulative_need":0\.105,"remaining":-0\.005,"shortage":0\.005,"status":"kurang"/);
  assert.match(res.text, /"stock":0\.1,"min_stock":0,/);
});
