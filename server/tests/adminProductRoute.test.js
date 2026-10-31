// Regresi tingkat HTTP Step 6.4 · AD-06 produk: GET daftar/detail, POST/PUT (JSON & multipart foto), toggle aktif
// (FR-30 · UC-23 · validation rule Produk). Kontrak & pesan = client mock adminCatalogViews/Writes.js; fieldErrors;
// foto { image_id } / { file_index } (milik produk, tanpa ganda, ≤ 5, data URL ditolak, PUT tanpa photos = foto tetap);
// file ditulis lalu dihapus bila gagal; kunci master data = pembacaan pertama. Prisma dipalsukan (helpers/catalogDb.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { installCatalogDb } = require('./helpers/catalogDb');

process.env.JWT_SECRET = 'test-secret-only';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ovc-products-'));

const app = require('../src/app');

const NOW = new Date('2026-11-03T03:00:00.000Z'); // Selasa 10.00 WIB
const TODAY = new Date('2026-11-03T00:00:00.000Z');
const PRODUCT_DIR = path.join(process.env.UPLOAD_DIR, 'products');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

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
test.beforeEach(() => {
  db = installCatalogDb(fakePrisma, TODAY);
  fs.rmSync(PRODUCT_DIR, { recursive: true, force: true });
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const staff = tokenFor('3');
const call = async (method, p, body, token = staff) => {
  const isForm = body instanceof FormData;
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
};
const form = (product, files = []) => {
  const fd = new FormData();
  fd.append('product', JSON.stringify(product));
  files.forEach((buf, i) => fd.append('photos', new Blob([buf], { type: 'image/png' }), `foto-${i}.png`));
  return fd;
};
const storedFiles = () => (fs.existsSync(PRODUCT_DIR) ? fs.readdirSync(PRODUCT_DIR) : []);
const valid = (overrides = {}) => ({
  name: 'Roti Sobek Keju', category_id: 1, description: 'Lembut', ingredients: '', allergens: 'Susu', price: '35000',
  availability_type: 'ready', lead_time_days: 0, is_active: true, variants: [], ...overrides,
});
const find = (id) => db.t.products.find((p) => p.productId === BigInt(id));
const dump = () => JSON.stringify(db.t, (k, v) => (typeof v === 'bigint' ? String(v) : v));

test('auth: tamu 401, pelanggan 403, Staf & Owner 200 (GET daftar, detail, simpan, toggle)', async () => {
  const before = dump();
  for (const [m, p, body] of [['GET', '/products'], ['GET', '/products/1'], ['POST', '/products', valid()], ['PUT', '/products/1', valid()], ['PATCH', '/products/1/active', { is_active: false }]]) {
    assert.equal((await call(m, p, body, null)).status, 401, p);
    assert.equal((await call(m, p, body, 'token-palsu')).json.code, 'SESSION_INVALID', p);
    assert.equal((await call(m, p, body, tokenFor('1'))).status, 403, p);
  }
  assert.equal(dump(), before);
  assert.equal((await call('GET', '/products', undefined, tokenFor('4'))).status, 200);
});

test('GET /products: semua produk (termasuk nonaktif) urut kategori lalu id; rating tanpa ulasan tersembunyi', async () => {
  const { status, json } = await call('GET', '/products');
  assert.equal(status, 200);
  assert.deepEqual(json.data.categories.map((c) => c.name), ['Roti', 'Cake', 'Pastry', 'Custom Cake']);
  assert.deepEqual(json.data.rows.map((r) => r.product_id), ['2', '4', '3', '1', '6']);
  const croissant = json.data.rows.find((r) => r.product_id === '1');
  assert.deepEqual(croissant, {
    product_id: '1', name: 'Classic Butter Croissant', price: 28000, category_id: 3, category_name: 'Pastry',
    availability_type: 'ready', lead_time_days: 0, is_active: true, image_url: '/images/products/croissant.webp',
    rating: { average: 4.5, count: 2 }, remaining_today: 15, has_stock_today: true, photo_count: 2,
  });
  const old = json.data.rows.find((r) => r.product_id === '4');
  assert.deepEqual([old.is_active, old.remaining_today, old.has_stock_today, old.image_url], [false, 0, false, null]);
  assert.equal(json.data.rows.find((r) => r.product_id === '3').remaining_today, null);
});

test('GET /products/:id: kolom produk + foto urut + semua varian; 404 & 400 INVALID_ID', async () => {
  let res = await call('GET', '/products/2');
  assert.deepEqual(res.json.data, {
    product_id: '2', category_id: 1, name: 'Signature Cinnamon Roll', description: '', ingredients: null, allergens: null,
    price: 32000, availability_type: 'ready', lead_time_days: 0, is_active: true, photos: [],
    variants: [
      { variant_id: '21', product_id: '2', name: 'Extra Glaze', extra_price: 5000, is_active: true },
      { variant_id: '22', product_id: '2', name: 'Lama', extra_price: 0, is_active: false },
    ],
  });
  res = await call('GET', '/products/1');
  assert.deepEqual(res.json.data.photos.map((p) => p.image_id), ['11', '12']);
  res = await call('GET', '/products/999');
  assert.deepEqual([res.status, res.json.message], [404, 'Produk tidak ditemukan.']);
  for (const bad of ['abc', '0', '-1', '1.5']) {
    res = await call('GET', `/products/${bad}`);
    assert.deepEqual([res.status, res.json.code], [400, 'INVALID_ID'], bad);
  }
});

test('POST JSON: 201 { product_id }, kolom & varian tersimpan; kunci master data = pembacaan pertama', async () => {
  const res = await call('POST', '/products', valid({ variants: [{ name: ' Ekstra Keju ', extra_price: '4000', is_active: true }] }));
  assert.equal(res.status, 201);
  const id = res.json.data.product_id;
  assert.deepEqual(res.json, { status: 'success', data: { product_id: id } });
  const row = find(id);
  assert.deepEqual(
    [row.name, row.categoryId, row.price, row.availabilityType, row.leadTimeDays, row.isActive, row.ingredients, row.allergens],
    ['Roti Sobek Keju', 1, 35000, 'ready', 0, true, null, 'Susu']
  );
  assert.deepEqual(db.t.variants.filter((v) => v.productId === BigInt(id)).map((v) => [v.name, v.extraPrice, v.isActive]), [['Ekstra Keju', 4000, true]]);
  const begin = db.ops.lastIndexOf('tx:begin');
  assert.equal(db.ops[begin + 1], 'lock:store_settings');
});

test('validasi produk → 400 fieldErrors dengan pesan & kunci sama dengan mock; tidak ada yang tersimpan', async () => {
  const before = dump();
  const cases = [
    [{ name: '  ' }, 'name', 'Isi nama produk'],
    [{ name: 'x'.repeat(101) }, 'name', 'Maksimal 100 karakter'],
    [{ category_id: '' }, 'category_id', 'Pilih kategori'],
    [{ category_id: 99 }, 'category_id', 'Pilih kategori'],
    [{ price: '0' }, 'price', 'Harga harus lebih dari Rp 0'],
    [{ price: 'abc' }, 'price', 'Harga harus lebih dari Rp 0'],
    [{ price: 10000000000 }, 'price', 'Harga terlalu besar'],
    [{ availability_type: 'x' }, 'availability_type', 'Pilih tipe produk'],
    [{ availability_type: 'preorder', category_id: 2, lead_time_days: 0 }, 'lead_time_days', 'Pre-order minimal 1 hari (H-1)'],
    [{ availability_type: 'preorder', category_id: 2, lead_time_days: 13 }, 'lead_time_days', 'Lead time maksimal 12 hari'],
    [{ availability_type: 'preorder', category_id: 2, lead_time_days: 1.5 }, 'lead_time_days', 'Isi lead time dalam hari (bilangan bulat)'],
    [{ availability_type: 'custom', category_id: 5, lead_time_days: 2, is_active: false }, 'lead_time_days', 'Custom cake minimal 3 hari (H-3)'],
    [{ availability_type: 'custom', category_id: 2, lead_time_days: 3, is_active: false }, 'category_id', 'Produk custom cake harus berada di kategori Custom Cake'],
    [{ category_id: 5 }, 'category_id', 'Kategori Custom Cake hanya untuk produk bertipe custom cake'],
    [{ availability_type: 'custom', category_id: 5, lead_time_days: 3 }, 'is_active', 'Sudah ada produk custom cake aktif. Nonaktifkan produk tersebut terlebih dahulu.'],
    [{ allergens: 'a'.repeat(256) }, 'allergens', 'Maksimal 255 karakter'],
  ];
  for (const [overrides, field, message] of cases) {
    const res = await call('POST', '/products', valid(overrides));
    assert.equal(res.status, 400, JSON.stringify(overrides));
    assert.equal(res.json.fieldErrors?.[field], message, JSON.stringify(overrides));
  }
  // Varian: error per baris + pesan pertama
  const res = await call('POST', '/products', valid({ variants: [{ name: 'A', extra_price: 0, is_active: true }, { name: 'a', extra_price: -1, is_active: true }, { name: '', extra_price: '', is_active: false }] }));
  assert.deepEqual(res.json.fieldErrors.variants, [null, { name: 'Nama varian sudah dipakai', extra_price: 'Harga tambahan minimal Rp 0' }, { name: 'Isi nama varian', extra_price: 'Harga tambahan minimal Rp 0' }]);
  assert.equal(res.json.message, 'Nama varian sudah dipakai');
  const custom = await call('PUT', '/products/6', valid({ name: 'Custom Celebration Cake', category_id: 5, availability_type: 'custom', lead_time_days: 3, variants: [{ name: 'X', extra_price: 0, is_active: true }] }));
  assert.equal(custom.json.fieldErrors.variantsGeneral, 'Custom cake memakai Opsi Custom Cake, bukan varian. Nonaktifkan varian.');
  // Bentuk body salah → 400 tanpa fieldErrors
  for (const body of [[], { name: 5 }, { variants: 'x' }, { is_active: 'ya' }, { photos: [{ file_index: 'a' }] }]) {
    const bad = await call('POST', '/products', body);
    assert.deepEqual([bad.status, bad.json.message, bad.json.fieldErrors], [400, 'Data permintaan tidak valid.', undefined], JSON.stringify(body));
  }
  assert.equal(dump(), before);
});

test('PUT JSON tanpa photos: foto lama tetap; varian dikirim diubah, baru dibuat, tidak dikirim tetap ada', async () => {
  const imagesBefore = JSON.stringify(db.t.images.filter((i) => i.productId === 1n), (k, v) => (typeof v === 'bigint' ? String(v) : v));
  let res = await call('PUT', '/products/1', valid({ name: 'Croissant Mentega', category_id: 3, price: 30000 }));
  assert.deepEqual([res.status, res.json.data], [200, { product_id: '1' }]);
  assert.deepEqual([find(1).name, find(1).price], ['Croissant Mentega', 30000]);
  assert.equal(JSON.stringify(db.t.images.filter((i) => i.productId === 1n), (k, v) => (typeof v === 'bigint' ? String(v) : v)), imagesBefore);

  res = await call('PUT', '/products/2', valid({ name: 'Signature Cinnamon Roll', variants: [{ variant_id: '21', name: 'Glaze Ekstra', extra_price: 6000, is_active: true }, { name: 'Kacang', extra_price: 3000, is_active: true }] }));
  assert.equal(res.status, 200);
  assert.deepEqual(db.t.variants.filter((v) => v.productId === 2n).map((v) => [String(v.variantId), v.name, Number(v.extraPrice), v.isActive]), [
    ['21', 'Glaze Ekstra', 6000, true], ['22', 'Lama', 0, false], ['301', 'Kacang', 3000, true],
  ]);
  // Varian kiriman yang tidak dikirim tetap dihitung untuk nama ganda (sama dengan mock)
  res = await call('PUT', '/products/2', valid({ variants: [{ name: 'lama', extra_price: 0, is_active: true }] }));
  // [lama (kiriman), Glaze Ekstra (21), Lama (22), Kacang (301)] → baris tersimpan 'Lama' ganda
  assert.equal(res.json.fieldErrors.variants[2].name, 'Nama varian sudah dipakai');
  // Varian milik produk lain ditolak; produk tidak ada 404
  res = await call('PUT', '/products/1', valid({ category_id: 3, variants: [{ variant_id: '21', name: 'X', extra_price: 0, is_active: true }] }));
  assert.deepEqual([res.status, res.json.message], [400, 'Varian tidak ditemukan. Muat ulang halaman.']);
  res = await call('PUT', '/products/999', valid());
  assert.equal(res.status, 404);
});

test('foto JSON: urutan = sort_order, foto dilepas dihapus (file unggahan saja), milik produk lain/ganda/data URL ditolak', async () => {
  fs.mkdirSync(PRODUCT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRODUCT_DIR, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'), 'x');
  const base = valid({ name: 'Classic Butter Croissant', category_id: 3 });

  let res = await call('PUT', '/products/1', { ...base, photos: [{ image_id: '12' }, { image_id: 11, image_url: '/images/products/croissant.webp' }] });
  assert.equal(res.status, 200);
  assert.deepEqual(db.t.images.filter((i) => i.productId === 1n).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => String(i.imageId)), ['12', '11']);

  for (const [photos, message] of [
    [[{ image_id: '31' }], 'Foto tidak ditemukan. Muat ulang halaman.'],
    [[{ image_id: '11' }, { image_id: 11 }], 'Foto yang sama dikirim lebih dari sekali.'],
    [[{ image_id: null, image_url: 'data:image/png;base64,AAAA' }], 'Foto baru harus diunggah sebagai file, bukan data URL.'],
    [[{ image_id: null }], 'Data foto tidak valid. Muat ulang halaman.'],
    [[{ image_id: '11', file_index: 0 }], 'Data foto tidak valid. Muat ulang halaman.'],
    [[{ file_index: 0 }], 'Foto baru tidak ditemukan pada unggahan.'],
    [Array.from({ length: 6 }, (_, i) => ({ image_id: String(11 + i) })), 'Maksimal 5 foto'],
  ]) {
    res = await call('PUT', '/products/1', { ...base, photos });
    assert.deepEqual([res.status, res.json.fieldErrors?.photos], [400, message], JSON.stringify(photos));
  }

  // Lepas foto unggahan → baris & file dihapus setelah commit; aset /images tidak disentuh
  res = await call('PUT', '/products/1', { ...base, photos: [{ image_id: '11' }] });
  assert.equal(res.status, 200);
  assert.deepEqual(db.t.images.filter((i) => i.productId === 1n).map((i) => [String(i.imageId), i.sortOrder]), [['11', 1]]);
  assert.deepEqual(storedFiles(), []);
  // photos: [] = semua foto dilepas
  res = await call('PUT', '/products/1', { ...base, photos: [] });
  assert.equal(db.t.images.filter((i) => i.productId === 1n).length, 0);
});

test('multipart: file baru disimpan (nama acak), urutan campuran, maks. 5, file tak dirujuk/bukan gambar ditolak tanpa file yatim', async () => {
  const base = valid({ name: 'Classic Butter Croissant', category_id: 3 });
  let res = await call('PUT', '/products/1', form({ ...base, photos: [{ file_index: 1 }, { image_id: '11' }, { file_index: 0 }] }, [PNG, PNG]));
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const rows = db.t.images.filter((i) => i.productId === 1n).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(rows.length, 3);
  assert.match(rows[0].imageUrl, /^\/uploads\/products\/[a-f0-9]{32}\.png$/);
  assert.equal(String(rows[1].imageId), '11');
  assert.deepEqual(storedFiles().sort(), rows.filter((r) => r.imageUrl.startsWith('/uploads/')).map((r) => path.basename(r.imageUrl)).sort());
  // File tersaji lewat /uploads/products
  const served = await fetch(`${baseUrl.replace('/api/admin', '')}${rows[0].imageUrl}`);
  assert.deepEqual([served.status, served.headers.get('x-content-type-options')], [200, 'nosniff']);

  const filesBefore = storedFiles().length;
  const cases = [
    [form({ ...base, photos: [{ file_index: 0 }] }, [PNG, PNG]), 'Setiap foto yang diunggah harus dicantumkan di daftar foto.'],
    [form({ ...base }, [PNG]), 'Setiap foto yang diunggah harus dicantumkan di daftar foto.'],
    [form({ ...base, photos: [{ file_index: 0 }, { file_index: 0 }] }, [PNG]), 'Foto yang sama dikirim lebih dari sekali.'],
    [form({ ...base, photos: [...rows.map((r) => ({ image_id: String(r.imageId) })), { file_index: 0 }, { file_index: 1 }, { file_index: 2 }] }, [PNG, PNG, PNG]), 'Maksimal 5 foto'],
  ];
  for (const [body, message] of cases) {
    res = await call('PUT', '/products/1', body);
    assert.deepEqual([res.status, res.json.fieldErrors?.photos ?? res.json.message], [400, message]);
  }
  const fake = new FormData();
  fake.append('product', JSON.stringify({ ...base, photos: [{ file_index: 0 }] }));
  fake.append('photos', new Blob([Buffer.from('bukan gambar sama sekali')], { type: 'image/png' }), 'a.png');
  res = await call('PUT', '/products/1', fake);
  assert.deepEqual([res.status, res.json.message], [400, 'Isi file bukan foto JPG, PNG, atau WebP yang valid.']);
  const six = form({ ...base, photos: [] }, [PNG, PNG, PNG, PNG, PNG, PNG]);
  res = await call('PUT', '/products/1', six);
  assert.deepEqual([res.status, res.json.message], [400, 'Maksimal 5 foto']);
  res = await call('PUT', '/products/1', (() => { const f = new FormData(); f.append('product', '{rusak'); return f; })());
  assert.deepEqual([res.status, res.json.message], [400, 'Data permintaan tidak valid.']);
  assert.equal(storedFiles().length, filesBefore);

  // Validasi field gagal setelah file ditulis → file baru dihapus (tidak ada file yatim)
  res = await call('PUT', '/products/1', form({ ...base, name: '', photos: [{ file_index: 0 }] }, [PNG]));
  assert.deepEqual([res.status, res.json.fieldErrors.name], [400, 'Isi nama produk']);
  assert.equal(storedFiles().length, filesBefore);
  // POST multipart → 201
  res = await call('POST', '/products', form({ ...valid(), photos: [{ file_index: 0 }] }, [PNG]));
  assert.equal(res.status, 201);
  assert.equal(db.t.images.filter((i) => i.productId === BigInt(res.json.data.product_id)).length, 1);
});

test('database gagal di tengah simpan → 500, rollback, file baru dihapus', async () => {
  const before = dump();
  db.failOn = 'productImage.create';
  const res = await call('PUT', '/products/1', form({ ...valid({ name: 'Ganti', category_id: 3 }), photos: [{ file_index: 0 }] }, [PNG]));
  assert.deepEqual([res.status, res.json], [500, { status: 'error', message: 'Terjadi kesalahan pada server.' }]);
  assert.equal(dump(), before);
  assert.deepEqual(storedFiles(), []);
});

test('PATCH active: toggle, aturan form (satu custom aktif), body tidak valid, 404', async () => {
  let res = await call('PATCH', '/products/4/active', { is_active: true });
  assert.deepEqual([res.status, res.json.data, find(4).isActive], [200, { product_id: '4', is_active: true }, true]);
  db.t.products.push({ productId: 7n, categoryId: 5, name: 'Custom 2', description: '', ingredients: null, allergens: null, price: '1', availabilityType: 'custom', leadTimeDays: 3, isActive: false });
  res = await call('PATCH', '/products/7/active', { is_active: true });
  assert.deepEqual([res.status, res.json.fieldErrors.is_active], [400, 'Sudah ada produk custom cake aktif. Nonaktifkan produk tersebut terlebih dahulu.']);
  assert.equal(find(7).isActive, false);
  res = await call('PATCH', '/products/6/active', { is_active: false });
  assert.equal(res.status, 200);
  res = await call('PATCH', '/products/7/active', { is_active: true });
  assert.equal(res.status, 200);
  for (const body of [{}, { is_active: 'true' }, { is_active: 1 }]) assert.equal((await call('PATCH', '/products/1/active', body)).status, 400);
  assert.equal((await call('PATCH', '/products/999/active', { is_active: true })).status, 404);
});

test('review 6.4 · harga & desimal → 400 fieldErrors (JSON & multipart), tidak ada yang tersimpan', async () => {
  const before = dump();
  for (const [overrides, field, message] of [
    [{ price: '28000.505' }, 'price', 'Maksimal 2 angka desimal'],
    [{ price: 0.004 }, 'price', 'Maksimal 2 angka desimal'],
    [{ price: 0 }, 'price', 'Harga harus lebih dari Rp 0'],
    [{ price: -1000 }, 'price', 'Harga harus lebih dari Rp 0'],
    [{ price: '9999999999.991' }, 'price', 'Harga terlalu besar'],
    [{ variants: [{ name: 'V', extra_price: '500.125', is_active: true }] }, 'variants', [{ extra_price: 'Maksimal 2 angka desimal' }]],
  ]) {
    const res = await call('POST', '/products', valid(overrides));
    assert.deepEqual([res.status, res.json.fieldErrors?.[field]], [400, message], JSON.stringify(overrides));
    const multipart = await call('POST', '/products', form({ ...valid(overrides), photos: [] }));
    assert.deepEqual([multipart.status, multipart.json.fieldErrors?.[field]], [400, message], `multipart ${JSON.stringify(overrides)}`);
  }
  assert.equal(dump(), before);
  // Harga 2 desimal & harga tambahan 0 diterima
  const ok = await call('POST', '/products', valid({ price: '28000.50', variants: [{ name: 'Biasa', extra_price: 0, is_active: true }] }));
  assert.equal(ok.status, 201);
  assert.equal(find(ok.json.data.product_id).price, 28000.5);
});

test('review 6.4 · deskripsi/komposisi > 65.535 byte → 400 fieldErrors (JSON & multipart), batas tepat & null diterima', async () => {
  const before = dump();
  const tooLong = 'Teks terlalu panjang (maksimal 65.535 byte)';
  let res = await call('POST', '/products', valid({ description: 'a'.repeat(65536) }));
  assert.deepEqual([res.status, res.json.fieldErrors?.description], [400, tooLong]);
  res = await call('PUT', '/products/1', form({ ...valid({ name: 'Classic Butter Croissant', category_id: 3 }), ingredients: 'é'.repeat(32768) }));
  assert.deepEqual([res.status, res.json.fieldErrors?.ingredients], [400, tooLong]);
  assert.equal(dump(), before);

  res = await call('POST', '/products', valid({ description: 'a'.repeat(65535), ingredients: null }));
  assert.equal(res.status, 201);
  const row = find(res.json.data.product_id);
  assert.deepEqual([row.description.length, row.ingredients], [65535, null]);
  res = await call('PUT', '/products/1', form({ ...valid({ name: 'Classic Butter Croissant', category_id: 3 }), description: '', ingredients: '€'.repeat(21845) }));
  assert.equal(res.status, 200);
  assert.deepEqual([find(1).description, Buffer.byteLength(find(1).ingredients)], ['', 65535]);
});
