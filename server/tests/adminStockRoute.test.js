// Regresi tingkat HTTP Step 6.4 · AD-07 (FR-32 · UC-24 · validation rule Stok): stok produk harian (hanya ready aktif,
// hari ini WIB; rencana ≥ terjual; semua baris sah atau tidak ada yang disimpan; baris yang belum ada dibuat) dan bahan
// baku (nama unik, satuan, desimal ≤ 2, status Aman/Menipis/Habis, stok masuk). Kontrak & pesan = client mock
// stockAdmin.js; urutan kunci (master data → baris stok urut product_id naik). Prisma dipalsukan (helpers/catalogDb.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

// 2026-11-02 17.30 UTC = Selasa 3 Nov 00.30 WIB → "hari ini" = 2026-11-03
const NOW = new Date('2026-11-02T17:30:00.000Z');
const TODAY = new Date('2026-11-03T00:00:00.000Z');

let db;
let server;
let baseUrl;

test.before(async () => {
  test.mock.timers.enable({ apis: ['Date'], now: NOW });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { db = installCatalogDb(fakePrisma, TODAY); });

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const call = async (method, p, body, token = tokenFor('3')) => {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const stockOf = (id) => db.t.dailyStocks.find((s) => s.productId === BigInt(id) && s.stockDate.getTime() === TODAY.getTime());
const material = (id) => db.t.materials.find((m) => m.materialId === BigInt(id));
const dump = () => JSON.stringify(db.t, (k, v) => (typeof v === 'bigint' ? String(v) : v));

test('auth: tamu 401, pelanggan 403 untuk 6 endpoint AD-07; Owner 200', async () => {
  for (const [m, p, b] of [
    ['GET', '/stocks/today'], ['PUT', '/stocks/today', { plans: [] }], ['GET', '/raw-materials'],
    ['POST', '/raw-materials', {}], ['PUT', '/raw-materials/1', {}], ['POST', '/raw-materials/1/stock-in', { qty: 1 }],
  ]) {
    assert.equal((await call(m, p, b, null)).status, 401, p);
    assert.equal((await call(m, p, b, tokenFor('1'))).status, 403, p);
  }
  assert.equal((await call('GET', '/stocks/today', undefined, tokenFor('4'))).status, 200);
});

test('GET stok harian: hanya produk ready aktif, hari ini WIB, sisa & status (tersedia / belum diisi)', async () => {
  const { json } = await call('GET', '/stocks/today');
  assert.equal(json.data.date, '2026-11-03');
  assert.deepEqual(json.data.rows, [
    { product_id: '1', name: 'Classic Butter Croissant', category_name: 'Pastry', image_url: '/images/products/croissant.webp', qty_planned: 20, qty_sold: 5, remaining: 15, status: 'tersedia' },
    { product_id: '2', name: 'Signature Cinnamon Roll', category_name: 'Roti', image_url: null, qty_planned: 0, qty_sold: 0, remaining: 0, status: 'belum_diisi' },
  ]);
  stockOf(1).qtySold = 20;
  assert.equal((await call('GET', '/stocks/today')).json.data.rows[0].status, 'habis');
});

test('PUT rencana: ubah baris ada, buat baris yang belum ada; kunci master data lalu baris urut product_id naik', async () => {
  db.t.products.push({ productId: 9n, categoryId: 1, name: 'Bagel', description: '', ingredients: null, allergens: null, price: '15000.00', availabilityType: 'ready', leadTimeDays: 0, isActive: true });
  const res = await call('PUT', '/stocks/today', { plans: [{ product_id: '9', qty_planned: 12 }, { product_id: 1, qty_planned: '25' }] });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual([stockOf(1).qtyPlanned, stockOf(1).qtySold], [25, 5]);
  assert.deepEqual([stockOf(9).qtyPlanned, stockOf(9).qtySold], [12, 0]);
  assert.deepEqual(res.json.data.rows.map((r) => [r.product_id, r.qty_planned, r.remaining, r.status]), [['1', 25, 20, 'tersedia'], ['2', 0, 0, 'belum_diisi'], ['9', 12, 12, 'tersedia']]);
  const begin = db.ops.lastIndexOf('tx:begin');
  assert.equal(db.ops[begin + 1], 'lock:store_settings');
  assert.deepEqual(db.raw.filter((r) => /FOR UPDATE/.test(r.sql) && /daily_stocks/.test(r.sql)).map((r) => String(r.values[0])), ['1', '9']);
});

test('PUT rencana ditolak (fieldErrors per product_id, pesan mock), semua atau tidak sama sekali', async () => {
  const before = dump();
  const cases = [
    [[{ product_id: 1, qty_planned: 4 }], { 1: 'Minimal 5 (sudah terjual 5)' }],
    [[{ product_id: 1, qty_planned: -1 }], { 1: 'Stok tidak boleh negatif' }],
    [[{ product_id: 1, qty_planned: '' }], { 1: 'Isi jumlah dalam bilangan bulat' }],
    [[{ product_id: 1, qty_planned: 2.5 }], { 1: 'Isi jumlah dalam bilangan bulat' }],
    [[{ product_id: 1, qty_planned: 3000000000 }], { 1: 'Jumlah terlalu besar' }],
    [[{ product_id: 3, qty_planned: 5 }], { 3: 'Produk ini bukan produk ready yang aktif' }],
    [[{ product_id: 4, qty_planned: 5 }], { 4: 'Produk ini bukan produk ready yang aktif' }],
    [[{ product_id: 'abc', qty_planned: 5 }], { abc: 'Produk ini bukan produk ready yang aktif' }],
    // Satu baris sah + satu salah → tidak ada yang tersimpan (baris 0/0 yang dibuat ikut rollback)
    [[{ product_id: 2, qty_planned: 8 }, { product_id: 1, qty_planned: 1 }], { 1: 'Minimal 5 (sudah terjual 5)' }],
  ];
  for (const [plans, fieldErrors] of cases) {
    const res = await call('PUT', '/stocks/today', { plans });
    assert.deepEqual([res.status, res.json.fieldErrors, res.json.message], [400, fieldErrors, Object.values(fieldErrors)[0]], JSON.stringify(plans));
  }
  for (const body of [{ plans: [] }, {}]) {
    const res = await call('PUT', '/stocks/today', body);
    assert.deepEqual([res.status, res.json.message], [400, 'Tidak ada perubahan stok untuk disimpan']);
  }
  for (const body of [[], { plans: 'x' }, { plans: [{ product_id: {} }] }]) assert.equal((await call('PUT', '/stocks/today', body)).status, 400);
  assert.equal(dump(), before);
});

test('PUT rencana: qty_sold dibaca dari baris TERKUNCI (pesanan yang commit saat admin menunggu kunci ikut dihitung)', async () => {
  // Checkout lain menjual 10 croissant saat admin menunggu kunci baris stok
  db.hooks.onQuery = (sql) => {
    if (/FROM daily_stocks/.test(sql) && db.hooks.onQuery) { db.hooks.onQuery = null; stockOf(1).qtySold = 15; }
  };
  const res = await call('PUT', '/stocks/today', { plans: [{ product_id: 1, qty_planned: 12 }] });
  assert.deepEqual([res.status, res.json.fieldErrors], [400, { 1: 'Minimal 15 (sudah terjual 15)' }]);
  assert.equal(stockOf(1).qtyPlanned, 20);
});

test('database gagal saat menulis rencana → 500 & rollback (termasuk baris baru)', async () => {
  const before = dump();
  db.failOn = 'dailyStock.update';
  db.t.products.push({ productId: 9n, categoryId: 1, name: 'Bagel', description: '', ingredients: null, allergens: null, price: '1', availabilityType: 'ready', leadTimeDays: 0, isActive: true });
  const withBagel = dump();
  const res = await call('PUT', '/stocks/today', { plans: [{ product_id: 9, qty_planned: 3 }] });
  assert.equal(res.status, 500);
  assert.equal(dump(), withBagel);
  assert.notEqual(before, withBagel);
});

test('GET bahan baku: urut id, status Aman/Menipis/Habis, ringkasan', async () => {
  const { json } = await call('GET', '/raw-materials');
  assert.deepEqual(json.data.rows, [
    { material_id: '1', name: 'Tepung Terigu', unit: 'kg', stock: 25, min_stock: 10, status: 'aman' },
    { material_id: '2', name: 'Butter', unit: 'kg', stock: 4.5, min_stock: 5, status: 'menipis' },
    { material_id: '3', name: 'Telur', unit: 'butir', stock: 0, min_stock: 30, status: 'habis' },
  ]);
  assert.deepEqual(json.data.summary, { aman: 1, menipis: 1, habis: 1 });
});

test('POST 201 / PUT 200 bahan baku; validasi → fieldErrors (pesan mock); 404 / INVALID_ID', async () => {
  let res = await call('POST', '/raw-materials', { name: ' Gula Halus ', unit: ' kg ', stock: '12.5', min_stock: 3 });
  assert.deepEqual([res.status, res.json.data], [201, { material_id: '61', name: 'Gula Halus', unit: 'kg', stock: 12.5, min_stock: 3, status: 'aman' }]);
  res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '6', min_stock: '5', expected_stock: '4.5' });
  assert.deepEqual([res.status, res.json.data.status, material(2).stock], [200, 'aman', '6']);
  assert.equal(db.ops[db.ops.lastIndexOf('tx:begin') + 1], 'lock:store_settings');

  const before = dump();
  for (const [body, field, message] of [
    [{ name: '', unit: 'kg', stock: 1, min_stock: 1 }, 'name', 'Isi nama bahan'],
    [{ name: ' tepung terigu ', unit: 'kg', stock: 1, min_stock: 1 }, 'name', 'Bahan dengan nama ini sudah ada'],
    [{ name: 'x'.repeat(101), unit: 'kg', stock: 1, min_stock: 1 }, 'name', 'Maksimal 100 karakter'],
    [{ name: 'Ragi', unit: '', stock: 1, min_stock: 1 }, 'unit', 'Isi satuan, mis. kg atau butir'],
    [{ name: 'Ragi', unit: 'u'.repeat(21), stock: 1, min_stock: 1 }, 'unit', 'Maksimal 20 karakter'],
    [{ name: 'Ragi', unit: 'g', stock: '', min_stock: 1 }, 'stock', 'Isi stok'],
    [{ name: 'Ragi', unit: 'g', stock: -1, min_stock: 1 }, 'stock', 'Stok tidak boleh negatif'],
    [{ name: 'Ragi', unit: 'g', stock: '1.234', min_stock: 1 }, 'stock', 'Maksimal 2 angka desimal'],
    [{ name: 'Ragi', unit: 'g', stock: '1,5', min_stock: 1 }, 'stock', 'Isi stok'],
    [{ name: 'Ragi', unit: 'g', stock: 100000000, min_stock: 1 }, 'stock', 'Stok terlalu besar'],
    [{ name: 'Ragi', unit: 'g', stock: 1, min_stock: '' }, 'min_stock', 'Isi batas minimum'],
  ]) {
    res = await call('POST', '/raw-materials', body);
    assert.deepEqual([res.status, res.json.fieldErrors?.[field]], [400, message], JSON.stringify(body));
  }
  // Nama sendiri boleh dipakai saat mengubah bahan yang sama
  assert.equal((await call('PUT', '/raw-materials/1', { name: 'TEPUNG TERIGU', unit: 'kg', stock: 25, min_stock: 10 })).status, 200);
  Object.assign(material(1), { name: 'Tepung Terigu', stock: '25.00', minStock: '10.00' });
  assert.equal(dump(), before);
  assert.equal((await call('PUT', '/raw-materials/999', { name: 'A', unit: 'g', stock: 1, min_stock: 1 })).status, 404);
  assert.equal((await call('PUT', '/raw-materials/x', { name: 'A', unit: 'g', stock: 1, min_stock: 1 })).json.code, 'INVALID_ID');
  for (const body of [[], { name: {} }, { stock: true }]) assert.equal((await call('POST', '/raw-materials', body)).status, 400);
});

test('stok masuk: bertambah tepat (desimal), status ikut berubah; validasi pesan mock; 404; baris dikunci dulu', async () => {
  let res = await call('POST', '/raw-materials/2/stock-in', { qty: '0.6' });
  assert.deepEqual([res.status, res.json.data.stock, res.json.data.status, material(2).stock], [200, 5.1, 'aman', '5.10']);
  assert.equal(db.ops[db.ops.lastIndexOf('tx:begin') + 1], 'lock:raw_materials');
  res = await call('POST', '/raw-materials/3/stock-in', { qty: 30 });
  assert.deepEqual([res.json.data.stock, res.json.data.status], [30, 'menipis']);

  const before = dump();
  for (const [qty, message] of [
    ['', 'Isi jumlah masuk'], [0, 'Jumlah masuk harus lebih dari 0'], [-2, 'Jumlah masuk tidak boleh negatif'],
    ['1.555', 'Maksimal 2 angka desimal'], [99999999.99, 'Stok baru melebihi batas penyimpanan'], [null, 'Isi jumlah masuk'],
  ]) {
    res = await call('POST', '/raw-materials/1/stock-in', { qty });
    assert.deepEqual([res.status, res.json.message], [400, message], String(qty));
  }
  assert.equal(dump(), before);
  assert.equal((await call('POST', '/raw-materials/999/stock-in', { qty: 1 })).status, 404);
  assert.equal((await call('POST', '/raw-materials/1/stock-in', { qty: {} })).status, 400);
  db.failOn = 'rawMaterial.stockIn';
  assert.equal((await call('POST', '/raw-materials/1/stock-in', { qty: 1 })).status, 500);
  assert.equal(dump(), before);
});

test('PUT bahan — edit informasi tidak menulis stok; koreksi wajib expected_stock yang masih berlaku', async () => {
  // Form dibuka saat Butter = 4.50; lalu stok masuk 2 → 6.50 di DB
  material(2).stock = '6.50';
  // Edit nama (stok kiriman = stok saat form dibuka) → stok terbaru dipertahankan, kolom stock tidak ditulis
  let res = await call('PUT', '/raw-materials/2', { name: 'Butter Prancis', unit: 'kg', stock: '4.5', min_stock: '5', expected_stock: '4.50' });
  assert.deepEqual([res.status, res.json.data.name, res.json.data.stock, material(2).stock], [200, 'Butter Prancis', 6.5, '6.50']);
  const ops = db.ops.slice(db.ops.lastIndexOf('tx:begin') + 1);
  assert.deepEqual(ops.filter((o) => o.startsWith('lock:')), ['lock:store_settings', 'lock:raw_materials']);
  assert.equal(ops.indexOf('lock:raw_materials') < ops.indexOf('rawMaterial.findMany'), true);
  // Edit satuan tanpa field stock sama sekali → stok tetap; validasi memakai stok terkunci
  res = await call('PUT', '/raw-materials/2', { name: 'Butter Prancis', unit: 'gram', min_stock: '5' });
  assert.deepEqual([res.status, res.json.data.unit, material(2).stock], [200, 'gram', '6.50']);
  // Stok kiriman = stok database tanpa expected (form saat ini, tidak ada stok masuk) → bukan koreksi, diterima
  res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '6.5', min_stock: '5' });
  assert.deepEqual([res.status, material(2).stock], [200, '6.50']);

  const before = dump();
  // Koreksi tanpa expected_stock → 400 fieldErrors.stock (tidak boleh mengubah stok absolut)
  res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '3', min_stock: '5' });
  assert.deepEqual([res.status, res.json.fieldErrors.stock, res.json.message], [400, res.json.message, 'Koreksi stok wajib menyertakan stok awal form (expected_stock). Muat ulang data lalu ulangi koreksi stok.']);
  // Koreksi dengan expected_stock kedaluwarsa → 409 fieldErrors.stock
  res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '3', min_stock: '5', expected_stock: '4.5' });
  assert.deepEqual([res.status, res.json.fieldErrors.stock], [409, res.json.message]);
  assert.match(res.json.message, /^Stok bahan sudah berubah/);
  // expected_stock tidak sah → 400
  for (const expected of ['abc', '-1', '1.234']) {
    res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '7', min_stock: '5', expected_stock: expected });
    assert.deepEqual([res.status, res.json.message], [400, 'Stok awal form tidak valid. Muat ulang data.'], expected);
  }
  assert.equal(dump(), before);

  // Koreksi dengan expected_stock yang masih berlaku → stok absolut tersimpan
  res = await call('PUT', '/raw-materials/2', { name: 'Butter', unit: 'kg', stock: '3', min_stock: '5', expected_stock: 6.5 });
  assert.deepEqual([res.status, material(2).stock, res.json.data.status], [200, '3', 'menipis']);
  // Stok awal POST tetap wajib (bahan baru)
  res = await call('POST', '/raw-materials', { name: 'Ragi', unit: 'g', min_stock: 1 });
  assert.deepEqual([res.status, res.json.fieldErrors.stock], [400, 'Isi stok']);
  assert.equal((await call('PUT', '/raw-materials/999', { name: 'A', unit: 'g', min_stock: 1 })).status, 404);
});
