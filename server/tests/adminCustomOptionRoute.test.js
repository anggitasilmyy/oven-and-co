// Regresi tingkat HTTP Step 6.4 · AD-06 tab Opsi Custom Cake (FR-31 · UC-23): GET per kelompok + produk custom aktif,
// POST/PUT/PATCH dengan aturan mock (nama unik per kelompok, kelompok tetap, minimal satu opsi aktif), fieldErrors,
// 201/200/404/409, kunci master data = pembacaan pertama, rollback. Prisma dipalsukan (helpers/catalogDb.js).

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
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/custom-options`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, new Date('2026-11-03T00:00:00.000Z')); });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, token = tokenFor('4')) => {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const opt = (id) => db.t.options.find((o) => o.optionId === id);
const dump = () => JSON.stringify(db.t, (k, v) => (typeof v === 'bigint' ? String(v) : v));

test('auth: tamu 401, pelanggan 403; Staf 200', async () => {
  for (const [m, p, body] of [['GET', ''], ['POST', '', { option_group: 'rasa', name: 'X', extra_price: 0 }], ['PUT', '/9', { name: 'X', extra_price: 0 }], ['PATCH', '/9/active', { is_active: false }]]) {
    assert.equal((await call(m, p, body, null)).status, 401);
    assert.equal((await call(m, p, body, tokenFor('1'))).status, 403);
  }
  assert.equal((await call('GET', '', undefined, tokenFor('3'))).status, 200);
});

test('GET: 4 kelompok urut builder, opsi aktif & nonaktif urut id, produk custom aktif, lead time ≥ 3', async () => {
  const { json } = await call('GET', '');
  assert.deepEqual(json.data.groups.map((g) => [g.group, g.options.map((o) => o.option_id)]), [
    ['ukuran', [1, 2]], ['bentuk', [5]], ['rasa', [9]], ['krim_topping', [13, 14]],
  ]);
  assert.deepEqual(json.data.groups[1].options[0], {
    option_id: 5, option_group: 'bentuk', name: 'Bulat', description: null, extra_price: 0, image_url: '/img/bulat.png', is_active: true,
  });
  assert.deepEqual(json.data.custom_product, { product_id: '6', name: 'Custom Celebration Cake', price: 450000 });
  assert.equal(json.data.lead_time_days, 3);
  db.t.products.find((p) => p.productId === 6n).isActive = false;
  const none = await call('GET', '');
  assert.deepEqual([none.json.data.custom_product, none.json.data.lead_time_days], [null, 3]);
});

test('POST 201 & PUT 200: nama dirapikan, kelompok lama tetap walau dikirim lain, image_url dipertahankan', async () => {
  let res = await call('POST', '', { option_group: 'rasa', name: ' Red Velvet ', description: '', extra_price: '20000' });
  assert.equal(res.status, 201);
  const id = res.json.data.option_id;
  assert.deepEqual([opt(id).optionGroup, opt(id).name, opt(id).description, Number(opt(id).extraPrice), opt(id).isActive, opt(id).imageUrl], ['rasa', 'Red Velvet', null, 20000, true, null]);
  assert.equal(db.ops[db.ops.lastIndexOf('tx:begin') + 1], 'lock:store_settings');

  res = await call('PUT', '/5', { option_group: 'rasa', name: 'Bulat Besar', description: 'Ø 22 cm', extra_price: 5000, is_active: true });
  assert.deepEqual([res.status, res.json.data], [200, { option_id: 5 }]);
  assert.deepEqual([opt(5).optionGroup, opt(5).name, opt(5).description, opt(5).imageUrl], ['bentuk', 'Bulat Besar', 'Ø 22 cm', '/img/bulat.png']);
});

test('validasi → 400 fieldErrors (pesan mock); nonaktif lewat form untuk opsi aktif terakhir ditolak', async () => {
  const before = dump();
  for (const [body, field, message] of [
    [{ option_group: 'lain', name: 'X', extra_price: 0 }, 'option_group', 'Pilih kelompok opsi'],
    [{ option_group: 'rasa', name: '', extra_price: 0 }, 'name', 'Isi nama opsi'],
    [{ option_group: 'rasa', name: 'x'.repeat(51), extra_price: 0 }, 'name', 'Maksimal 50 karakter'],
    [{ option_group: 'rasa', name: ' cokelat ', extra_price: 0 }, 'name', 'Nama sudah dipakai di kelompok Rasa'],
    [{ option_group: 'rasa', name: 'Pandan', description: 'd'.repeat(101), extra_price: 0 }, 'description', 'Maksimal 100 karakter'],
    [{ option_group: 'rasa', name: 'Pandan', extra_price: -1 }, 'extra_price', 'Harga tambahan minimal Rp 0'],
    [{ option_group: 'rasa', name: 'Pandan', extra_price: '' }, 'extra_price', 'Harga tambahan minimal Rp 0'],
    [{ option_group: 'rasa', name: 'Pandan', extra_price: 1e11 }, 'extra_price', 'Harga tambahan terlalu besar'],
  ]) {
    const res = await call('POST', '', body);
    assert.deepEqual([res.status, res.json.fieldErrors?.[field]], [400, message], JSON.stringify(body));
  }
  // Nama sama di kelompok lain boleh
  assert.equal((await call('POST', '', { option_group: 'bentuk', name: 'Cokelat', extra_price: 0 })).status, 201);
  db.t.options.pop();
  const res = await call('PUT', '/9', { name: 'Cokelat', extra_price: 0, is_active: false });
  assert.deepEqual([res.status, res.json.fieldErrors.is_active], [400, 'Kelompok Rasa harus punya minimal satu opsi aktif']);
  for (const body of [[], { name: 1 }, { is_active: 'no' }]) assert.equal((await call('POST', '', body)).status, 400);
  assert.equal(dump(), before);
  assert.equal((await call('PUT', '/999', { name: 'X', extra_price: 0 })).status, 404);
  assert.deepEqual([(await call('PUT', '/abc', { name: 'X', extra_price: 0 })).json.code], ['INVALID_ID']);
});

test('PATCH active: nonaktifkan bila masih ada opsi aktif lain; opsi aktif terakhir → 409; aktifkan kembali', async () => {
  let res = await call('PATCH', '/1/active', { is_active: false });
  assert.deepEqual([res.status, res.json.data, opt(1).isActive], [200, { option_id: 1, is_active: false }, false]);
  res = await call('PATCH', '/2/active', { is_active: false });
  assert.deepEqual([res.status, res.json.message, opt(2).isActive], [409, 'Kelompok Ukuran harus punya minimal satu opsi aktif', true]);
  res = await call('PATCH', '/14/active', { is_active: true });
  assert.equal(res.status, 200);
  assert.equal((await call('PATCH', '/14/active', { is_active: false })).status, 200);
  assert.equal((await call('PATCH', '/999/active', { is_active: false })).status, 404);
  assert.equal((await call('PATCH', '/1/active', {})).status, 400);
});

test('database gagal → 500 dan rollback', async () => {
  const before = dump();
  db.failOn = 'customOption.update';
  const res = await call('PUT', '/5', { name: 'Hati', extra_price: 0 });
  assert.equal(res.status, 500);
  assert.equal(dump(), before);
});

test('review 6.4 · harga tambahan opsi: 0 & 2 desimal diterima, 3 desimal → 400 fieldErrors (tidak dibulatkan)', async () => {
  let res = await call('POST', '', { option_group: 'rasa', name: 'Pandan', extra_price: '0' });
  assert.equal(res.status, 201);
  res = await call('PUT', '/9', { name: 'Cokelat', extra_price: '12500.75', is_active: true });
  assert.deepEqual([res.status, Number(opt(9).extraPrice)], [200, 12500.75]);
  const before = dump();
  for (const extra of ['15000.001', 0.004]) {
    res = await call('POST', '', { option_group: 'rasa', name: 'Matcha', extra_price: extra });
    assert.deepEqual([res.status, res.json.fieldErrors?.extra_price], [400, 'Maksimal 2 angka desimal'], String(extra));
  }
  assert.equal(dump(), before);
});
