// CR-03 CP4 · FR-39 · UC-31 · BR-13 · AD-06 — GET|PUT /api/admin/products/:id/materials tingkat HTTP (Prisma
// dipalsukan, helpers/catalogDb.js — BUKAN bukti locking MySQL; lihat tests-mysql/17-product-recipe.it.test.js).
// AC-39.1 – AC-39.9, CS-2/CS-3 (urutan kunci = pembacaan pertama), CS-4 (identik → tanpa tulis/audit), CS-5 (rollback).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

let db;
let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/products`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, new Date('2026-11-11T00:00:00.000Z')); });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const stored = (productId = 1n) => db.t.productMaterials.filter((r) => r.productId === productId)
  .map((r) => [String(r.materialId), r.qtyPerUnit]).sort();
const RECIPE = { items: [{ material_id: '3', qty_per_unit: '1.5' }, { material_id: '2', qty_per_unit: '0.015' }] };

test('AC-39.7 akses: tanpa token 401, pelanggan 403, Staf & Owner 200 (GET & PUT)', async () => {
  for (const method of ['GET', 'PUT']) {
    const body = method === 'PUT' ? RECIPE : undefined;
    assert.equal((await call(method, '/1/materials', body, null)).status, 401);
    assert.equal((await call(method, '/1/materials', body, tokenFor('1'))).status, 403);
  }
  assert.equal((await call('GET', '/1/materials', undefined, tokenFor('3'))).status, 200);
  assert.equal((await call('GET', '/1/materials', undefined, tokenFor('4'))).status, 200);
  assert.equal((await call('PUT', '/1/materials', RECIPE, tokenFor('4'))).status, 200);
  assert.equal(db.t.auditLogs.length, 1);
});

test('GET: bentuk B7.1 (ID string, qty_per_unit number), produk nonaktif boleh, 400 ID tidak sah, 404 produk', async () => {
  const res = await call('GET', '/1/materials');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data, {
    product_id: '1', product_name: 'Classic Butter Croissant', availability_type: 'ready',
    items: [{ material_id: '2', name: 'Butter', unit: 'kg', qty_per_unit: 0.015 }],
  });
  assert.deepEqual((await call('GET', '/4/materials')).json.data.items, []); // nonaktif, tanpa komposisi
  assert.deepEqual((await call('GET', '/abc/materials')).json.message, 'ID produk tidak valid.');
  assert.equal((await call('GET', '/abc/materials')).status, 400);
  const missing = await call('GET', '/99/materials');
  assert.deepEqual([missing.status, missing.json.message], [404, 'Produk tidak ditemukan.']);
});

test('PUT AC-39.1/AC-39.4: ganti seluruh komposisi, takaran 3 desimal tersimpan & kembali number tepat; 1 audit', async () => {
  const res = await call('PUT', '/1/materials', { items: [{ material_id: '3', qty_per_unit: '9999999.999' }, { material_id: '2', qty_per_unit: '0.015' }] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data.items.map((i) => [i.material_id, i.qty_per_unit, i.unit]), [['2', 0.015, 'kg'], ['3', 9999999.999, 'butir']]);
  assert.deepEqual(stored(), [['2', '0.015'], ['3', '9999999.999']]);
  assert.equal(db.t.auditLogs.length, 1);
  assert.deepEqual(db.t.auditLogs.map((a) => [a.userId, a.action, a.entity, a.entityId]), [[3n, 'update_product_recipe', 'products', 1n]]);
  // AC-39.1 produk nonaktif dapat diisi & dikosongkan
  assert.equal((await call('PUT', '/4/materials', { items: [{ material_id: '1', qty_per_unit: '2' }] })).status, 200);
  assert.deepEqual(stored(4n), [['1', '2.000']]);
  const cleared = await call('PUT', '/4/materials', { items: [] });
  assert.deepEqual([cleared.status, cleared.json.data.items, stored(4n), db.t.auditLogs.length], [200, [], [], 3]);
});

test('CS-4 / AC-39.8: isi identik atau hanya beda urutan / format nilai → tanpa tulis & tanpa audit', async () => {
  assert.equal((await call('PUT', '/1/materials', RECIPE)).status, 200);
  db.ops.length = 0;
  for (const body of [RECIPE, { items: [...RECIPE.items].reverse() }, { items: [{ material_id: '2', qty_per_unit: '0.015' }, { material_id: 3, qty_per_unit: '1.500' }] }]) {
    const res = await call('PUT', '/1/materials', body);
    assert.equal(res.status, 200);
  }
  assert.equal(db.t.auditLogs.length, 1, 'hanya PUT pertama yang mengubah isi');
  assert.ok(!db.ops.some((op) => /productMaterial\.(deleteMany|createMany)|auditLog/.test(op)), db.ops.join(','));
  // beberapa perubahan sekaligus → tetap 1 audit per PUT
  await call('PUT', '/1/materials', { items: [{ material_id: '1', qty_per_unit: '0.1' }] });
  assert.equal(db.t.auditLogs.length, 2);
});

test('AC-39.3 validasi → 400 + fieldErrors per baris; tidak ada perubahan & tanpa audit', async () => {
  const before = stored();
  const cases = [
    [{ items: [{ material_id: '2', qty_per_unit: 0.015 }] }, { 'items.0.qty_per_unit': 'Kirim takaran sebagai teks desimal' }],
    [{ items: [{ material_id: '2', qty_per_unit: '0.0015' }] }, { 'items.0.qty_per_unit': 'Maksimal 3 angka desimal' }],
    [{ items: [{ material_id: '2', qty_per_unit: '0' }] }, { 'items.0.qty_per_unit': 'Takaran harus lebih dari 0' }],
    [{ items: [{ material_id: '2', qty_per_unit: '10000000' }] }, { 'items.0.qty_per_unit': 'Takaran terlalu besar' }],
    [{ items: [{ material_id: '2', qty_per_unit: '1' }, { material_id: '2', qty_per_unit: '2' }] }, { 'items.1.material_id': 'Bahan sudah ada di komposisi' }],
    [{ items: [{ material_id: '99', qty_per_unit: '1' }] }, { 'items.0.material_id': 'Bahan tidak terdaftar' }],
    [{ items: 'x' }, { items: 'Daftar komposisi tidak valid' }],
    [{}, { items: 'Daftar komposisi tidak valid' }],
    [{ items: Array.from({ length: 31 }, () => ({ material_id: '1', qty_per_unit: '1' })) }, null],
  ];
  for (const [body, fieldErrors] of cases) {
    const res = await call('PUT', '/1/materials', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    if (fieldErrors) assert.deepEqual(res.json.fieldErrors, fieldErrors);
    else assert.equal(res.json.fieldErrors.items, 'Maksimal 30 bahan per produk');
  }
  for (const raw of ['[]', '"x"', 'null']) assert.equal((await call('PUT', '/1/materials', raw)).status, 400, raw);
  assert.equal((await call('PUT', '/abc/materials', RECIPE)).status, 400);
  const missing = await call('PUT', '/99/materials', RECIPE);
  assert.deepEqual([missing.status, missing.json.message], [404, 'Produk tidak ditemukan.']);
  assert.deepEqual(stored(), before);
  assert.equal(db.t.auditLogs.length, 0);
});

test('CS-2/CS-3: transaksi tunggal; kunci pelaku S lalu store_settings X sebelum pembacaan lain', async () => {
  db.ops.length = 0;
  assert.equal((await call('PUT', '/1/materials', RECIPE)).status, 200);
  const firstFour = db.ops.slice(0, 3);
  assert.deepEqual(firstFour, ['tx:begin', 'lock:users:S', 'lock:store_settings']);
  assert.equal(db.ops.filter((op) => op === 'tx:begin').length, 1);
  assert.ok(!db.ops.slice(3).some((op) => op.startsWith('lock:')), 'tidak ada kunci eksplisit lain (produk/bahan)');
  const order = ['productMaterial.findMany', 'productMaterial.deleteMany', 'productMaterial.createMany', 'auditLog.create'];
  assert.deepEqual(db.ops.filter((op) => order.includes(op)).slice(0, 4), order); // baca lama → hapus → sisip → audit
});

test('CS-5 rollback: gagal saat sisip, audit, atau kunci → komposisi lama utuh & tanpa audit; pelaku nonaktif 401', async () => {
  for (const failOn of ['productMaterial.createMany', 'auditLog.create', 'lock:store_settings', 'productMaterial.deleteMany']) {
    db = installCatalogDb(fakePrisma, new Date('2026-11-11T00:00:00.000Z'));
    db.failOn = failOn;
    const res = await call('PUT', '/1/materials', RECIPE);
    assert.equal(res.status, 500, failOn);
    assert.deepEqual([stored(), db.t.auditLogs.length], [[['2', '0.015']], 0], failOn);
  }
  db = installCatalogDb(fakePrisma, new Date('2026-11-11T00:00:00.000Z'));
  db.t.users[3].isActive = false;
  const res = await call('PUT', '/1/materials', RECIPE);
  assert.deepEqual([res.status, res.json.code, stored(), db.t.auditLogs.length], [401, 'SESSION_INVALID', [['2', '0.015']], 0]);
});

test('AC-39.9 regresi AD-06: rute produk lain tetap berfungsi melewati router komposisi', async () => {
  assert.equal((await call('GET', '/1')).status, 200);
  assert.equal((await call('GET', '/')).status, 200);
  assert.equal((await call('GET', '/1', undefined, tokenFor('1'))).status, 403);
});
