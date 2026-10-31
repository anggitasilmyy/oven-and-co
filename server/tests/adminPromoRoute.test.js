// Regresi tingkat HTTP Step 6.4.9: /api/admin/vouchers & /api/admin/loyalty (FR-34 · UC-29 · BR-09 · BR-10 · AD-09).
// Hanya Owner; papan voucher (terpakai, status, produk) dalam snapshot REPEATABLE READ; tambah/ubah dengan fieldErrors
// mock; PUT mengunci baris voucher sebagai pembacaan pertama & menulis kuota hanya dengan expected_quota yang cocok
// (400/409); kode ganda (cek & P2002) → 400 fieldErrors.code; aktif/nonaktif; aturan loyalty (kunci store_settings,
// hanya 5 field). Prisma dipalsukan — locking MySQL sungguhan dibuktikan di uji integrasi MySQL 8.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');

// 2026-10-15 20.00 UTC = Jumat 16 Okt 2026 03.00 WIB → todayKey 2026-10-16
const NOW = new Date('2026-10-15T20:00:00.000Z');
const users = {
  1: { userId: 1n, role: 'customer', isActive: true },
  3: { userId: 3n, role: 'staf', isActive: true },
  4: { userId: 4n, role: 'owner', isActive: true },
};
const day = (k) => new Date(`${k}T00:00:00.000Z`);

let db;
let ops; // urutan operasi basis data
let txOptions;

function seed() {
  const vch = (voucherId, code, extra = {}) => ({
    voucherId: BigInt(voucherId), code, title: `Promo ${code}`, discountType: 'percent', discountValue: '15.00', productId: null,
    quota: 50, validFrom: day('2026-10-10'), validTo: day('2026-10-20'), isActive: true, ...extra,
  });
  return {
    vouchers: [
      vch(1, 'WEEKEND15', { productId: 4n }),
      vch(2, 'HEMAT10', { discountType: 'amount', discountValue: '10000.00', validTo: day('2026-11-05') }),
      vch(3, 'CROISSANT20', { productId: 1n, validFrom: day('2026-09-01'), validTo: day('2026-10-06') }), // berakhir
      vch(4, 'HABIS', { quota: 0 }),
      vch(5, 'NANTI', { validFrom: day('2026-10-18') }),
      vch(6, 'MATI', { isActive: false, productId: 99n }), // produk tidak ada lagi di daftar
    ],
    orders: [
      { voucherId: 1n, orderStatus: 'selesai' }, { voucherId: 1n, orderStatus: 'dikonfirmasi' }, { voucherId: 1n, orderStatus: 'dibatalkan' },
      { voucherId: 2n, orderStatus: 'menunggu_pembayaran' }, { voucherId: null, orderStatus: 'selesai' },
    ],
    products: [
      { productId: 4n, name: 'Assorted Cookies Box', isActive: true },
      { productId: 1n, name: 'Classic Butter Croissant', isActive: true },
      { productId: 11n, name: 'Red Velvet Slice', isActive: false },
    ],
    storeSetting: {
      settingId: 1, storeName: 'Oven & Co.', earnAmountPerPoint: '1000.00', redeemPointsUnit: 100, redeemValue: '5000.00',
      goldMinPoints: 500, platinumMinPoints: 2000, reviewBonusPoints: 20,
    },
  };
}

const clone = (row) => ({ ...row });
const voucherOf = (id) => db.vouchers.find((v) => v.voucherId === BigInt(id));
const withProduct = (v) => ({ ...v, product: db.products.find((p) => p.productId === v.productId) ?? null });

const client = {
  $queryRaw: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('FROM vouchers')) {
      ops.push(`lock:voucher:${values[0]}`);
      const v = voucherOf(values[0]);
      return v ? [{ voucher_id: v.voucherId, quota: v.quota }] : [];
    }
    if (sql.includes('FROM store_settings')) { ops.push('lock:store_settings'); return [{ setting_id: 1 }]; }
    throw new Error(`SQL tidak dikenal: ${sql}`);
  },
  voucher: {
    findMany: async ({ include }) => { ops.push('voucher.findMany'); assert.deepEqual(include, { product: { select: { name: true } } }); return db.vouchers.map(withProduct); },
    findUnique: async ({ where }) => {
      ops.push('voucher.findUnique');
      const v = where.code != null ? db.vouchers.find((x) => x.code === where.code) : voucherOf(where.voucherId);
      return v ? clone(v) : null;
    },
    create: async ({ data }) => {
      ops.push('voucher.create');
      if (db.vouchers.some((x) => x.code === data.code) || data.code === db.raceCode) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const row = { voucherId: BigInt(Math.max(...db.vouchers.map((x) => Number(x.voucherId))) + 1), ...data, discountValue: String(data.discountValue) };
      db.vouchers.push(row);
      return clone(row);
    },
    update: async ({ where, data }) => {
      ops.push(`voucher.update:${Object.keys(data).sort().join(',')}`);
      const v = voucherOf(where.voucherId);
      Object.assign(v, data, data.discountValue != null ? { discountValue: String(data.discountValue) } : {});
      return clone(v);
    },
    updateMany: async ({ where, data }) => {
      ops.push(`voucher.updateMany:${Object.keys(data).join(',')}`);
      const v = voucherOf(where.voucherId);
      if (!v) return { count: 0 };
      Object.assign(v, data);
      return { count: 1 };
    },
  },
  order: {
    groupBy: async ({ by, where }) => {
      ops.push('order.groupBy');
      assert.deepEqual(by, ['voucherId']);
      const counts = new Map();
      for (const o of db.orders.filter((r) => matchesWhere(r, where))) counts.set(o.voucherId, (counts.get(o.voucherId) ?? 0) + 1);
      return [...counts].map(([voucherId, n]) => ({ voucherId, _count: { _all: n } }));
    },
  },
  product: {
    findMany: async () => { ops.push('product.findMany'); return db.products.map(clone); },
    findUnique: async ({ where }) => { ops.push('product.findUnique'); return db.products.find((p) => p.productId === where.productId) ?? null; },
  },
  storeSetting: {
    findFirst: async () => { ops.push('storeSetting.findFirst'); return clone(db.storeSetting); },
    updateMany: async ({ data }) => { ops.push(`storeSetting.updateMany:${Object.keys(data).sort().join(',')}`); Object.assign(db.storeSetting, data); return { count: 1 }; },
  },
};
Object.assign(fakePrisma, client);
fakePrisma.user = { findUnique: async ({ where }) => users[String(where.userId)] ?? null };
// $transaction meniru rollback: perubahan data dibuang bila callback gagal
fakePrisma.$transaction = async (callback, options) => {
  txOptions.push(options);
  ops.push('tx:begin');
  const backup = structuredClone(db);
  try {
    return await callback(client);
  } catch (error) {
    db = backup;
    throw error;
  }
};

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
  db = seed();
  ops = [];
  txOptions = [];
});

const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const req = async (path, { method = 'GET', body, token = tokenFor('4') } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  return { status: res.status, json: await res.json() };
};
const form = (x = {}) => ({
  code: 'hemat5', title: 'Hemat Rp 5.000', discount_type: 'amount', discount_value: '5000', product_id: '', quota: '10',
  valid_from: '2026-10-16', valid_to: '2026-10-23', is_active: true, ...x,
});

test('hanya Owner di 6 endpoint: tamu 401, pelanggan & Staf 403 tanpa menyentuh data', async () => {
  const endpoints = [['/vouchers', {}], ['/vouchers', { method: 'POST', body: form() }], ['/vouchers/1', { method: 'PUT', body: form() }],
    ['/vouchers/1/active', { method: 'PATCH', body: { is_active: false } }], ['/loyalty', {}], ['/loyalty', { method: 'PUT', body: {} }]];
  for (const [path, opts] of endpoints) {
    assert.equal((await req(path, { ...opts, token: null })).status, 401, path);
    assert.equal((await req(path, { ...opts, token: tokenFor('1') })).status, 403, path);
    assert.equal((await req(path, { ...opts, token: tokenFor('3') })).status, 403, path);
  }
  assert.deepEqual(ops, []);
  assert.equal((await req('/vouchers')).status, 200);
  assert.equal((await req('/loyalty')).status, 200);
});

test('papan voucher: snapshot REPEATABLE READ; terpakai tanpa batal; status per hari ini WIB; urut berakhir ↓ lalu kode', async () => {
  const { status, json } = await req('/vouchers');
  assert.equal(status, 200);
  assert.deepEqual(txOptions.map((o) => o?.isolationLevel), ['RepeatableRead']);
  assert.deepEqual(ops, ['tx:begin', 'voucher.findMany', 'order.groupBy', 'product.findMany']);
  const { todayKey, rows, products } = json.data;
  assert.equal(todayKey, '2026-10-16');
  assert.deepEqual(rows.map((r) => [r.code, r.status, r.used]), [
    ['HEMAT10', 'aktif', 1], ['HABIS', 'kuota_habis', 0], ['MATI', 'nonaktif', 0], ['NANTI', 'terjadwal', 0], ['WEEKEND15', 'aktif', 2], ['CROISSANT20', 'berakhir', 0],
  ]);
  assert.deepEqual(rows.find((r) => r.code === 'WEEKEND15'), {
    voucher_id: '1', code: 'WEEKEND15', title: 'Promo WEEKEND15', discount_type: 'percent', discount_value: 15, product_id: '4', quota: 50,
    valid_from: '2026-10-10', valid_to: '2026-10-20', is_active: true, product_name: 'Assorted Cookies Box', used: 2, status: 'aktif',
  });
  assert.deepEqual([rows.find((r) => r.code === 'HEMAT10').product_name, rows.find((r) => r.code === 'MATI').product_name], [null, 'Produk #99']);
  assert.deepEqual(products, [
    { product_id: '4', name: 'Assorted Cookies Box', is_active: true },
    { product_id: '1', name: 'Classic Butter Croissant', is_active: true },
    { product_id: '11', name: 'Red Velvet Slice', is_active: false },
  ]);
});

test('tambah: 201 baris voucher (kode dirapikan, produk nonaktif boleh); semua field salah → fieldErrors mock tanpa menulis', async () => {
  const { status, json } = await req('/vouchers', { method: 'POST', body: form({ product_id: '11', discount_type: 'percent', discount_value: '20' }) });
  assert.equal(status, 201);
  assert.deepEqual(json.data, {
    voucher_id: '7', code: 'HEMAT5', title: 'Hemat Rp 5.000', discount_type: 'percent', discount_value: 20, product_id: '11', quota: 10,
    valid_from: '2026-10-16', valid_to: '2026-10-23', is_active: true,
  });
  assert.ok(!ops.some((o) => o.startsWith('lock:'))); // tambah tidak mengunci baris lain

  const bad = await req('/vouchers', { method: 'POST', body: { code: 'a b', discount_type: 'percent', discount_value: '120', product_id: '404', quota: '-1', valid_from: '2026-10-20', valid_to: '2026-10-10' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.fieldErrors, {
    code: 'Kode hanya huruf dan angka tanpa spasi', title: 'Isi judul promo', discount_value: 'Persen diskon berupa bilangan bulat 1–100',
    product_id: 'Produk tidak ditemukan', quota: 'Kuota berupa bilangan bulat 0–100.000', valid_to: 'Tanggal berakhir tidak boleh sebelum tanggal mulai',
  });
  assert.equal(bad.json.message, 'Kode hanya huruf dan angka tanpa spasi');
  assert.equal(db.vouchers.length, 7);
});

test('kode ganda: cek (huruf kecil dinormalisasi) & race UNIQUE P2002 → 400 fieldErrors.code yang sama', async () => {
  const dup = await req('/vouchers', { method: 'POST', body: form({ code: 'weekend15' }) });
  assert.deepEqual([dup.status, dup.json.fieldErrors], [400, { code: 'Kode voucher sudah dipakai' }]);
  db.raceCode = 'BALAPAN'; // baris lain dengan kode ini di-commit setelah pengecekan
  const race = await req('/vouchers', { method: 'POST', body: form({ code: 'balapan' }) });
  assert.deepEqual([race.status, race.json.message, race.json.fieldErrors], [400, 'Kode voucher sudah dipakai', { code: 'Kode voucher sudah dipakai' }]);
  assert.equal(db.vouchers.length, 6);
  // ubah kode ke kode voucher lain juga ditolak; kode sendiri boleh
  assert.equal((await req('/vouchers/2', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '50' }) })).json.fieldErrors.code, 'Kode voucher sudah dipakai');
  assert.equal((await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '50' }) })).status, 200);
});

test('ubah (edit informasi): kunci baris = pembacaan pertama; kuota form = expected → kuota TIDAK ditulis walau sudah berubah', async () => {
  voucherOf(1).quota = 47; // 3 checkout setelah form dibuka (kuota form 50)
  const { status, json } = await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', title: 'Judul baru', quota: '50', expected_quota: 50 }) });
  assert.equal(status, 200);
  assert.deepEqual([json.data.title, json.data.quota], ['Judul baru', 47]);
  assert.deepEqual(ops.slice(0, 2), ['tx:begin', 'lock:voucher:1']);
  assert.ok(ops.some((o) => o.startsWith('voucher.update:') && !o.includes('quota')));
  // tanpa expected tetapi kuota = kuota database → juga tidak ditulis
  ops = [];
  assert.equal((await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '47' }) })).status, 200);
  assert.ok(ops.some((o) => o.startsWith('voucher.update:') && !o.includes('quota')));
});

test('ubah kuota: expected cocok → ditulis; tanpa expected → 400; basi → 409 (fieldErrors.quota) dan tidak ada yang tersimpan', async () => {
  const ok = await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '80', expected_quota: '50' }) });
  assert.deepEqual([ok.status, ok.json.data.quota], [200, 80]);

  const missing = await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', title: 'Tidak tersimpan', quota: '90' }) });
  assert.deepEqual([missing.status, Object.keys(missing.json.fieldErrors)], [400, ['quota']]);
  assert.match(missing.json.message, /expected_quota/);

  voucherOf(1).quota = 78; // dua pemakaian setelah form dibuka dengan kuota 80
  const stale = await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', title: 'Tidak tersimpan', quota: '100', expected_quota: '80' }) });
  assert.deepEqual([stale.status, Object.keys(stale.json.fieldErrors)], [409, ['quota']]);
  assert.deepEqual([voucherOf(1).quota, voucherOf(1).title], [78, 'Hemat Rp 5.000']); // rollback: judul dari PUT sukses sebelumnya, bukan 'Tidak tersimpan'

  assert.equal((await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '100', expected_quota: 'x' }) })).status, 400);
});

test('ubah: tidak ada → 404 (setelah kunci); id tidak sah → 400 INVALID_ID; bentuk body salah → 400 tanpa fieldErrors', async () => {
  const nf = await req('/vouchers/404', { method: 'PUT', body: form() });
  assert.deepEqual([nf.status, nf.json.message], [404, 'Voucher tidak ditemukan']);
  for (const id of ['abc', '0', '9223372036854775808']) {
    const r = await req(`/vouchers/${id}`, { method: 'PUT', body: form() });
    assert.deepEqual([r.status, r.json.code], [400, 'INVALID_ID'], id);
  }
  for (const body of [form({ code: 5 }), form({ is_active: 'ya' }), [1, 2]]) {
    const r = await req('/vouchers', { method: 'POST', body });
    assert.deepEqual([r.status, r.json.message, r.json.fieldErrors], [400, 'Data permintaan tidak valid.', undefined]);
  }
  // JSON primitif ditolak lebih dulu oleh express.json (mode strict) — perilaku lama errorHandler
  const primitive = await req('/vouchers', { method: 'POST', body: '"teks"' });
  assert.deepEqual([primitive.status, primitive.json.message], [400, 'Format data JSON tidak valid.']);
});

test('aktif/nonaktif: hanya is_active berubah (kuota tetap), voucher berakhir boleh diaktifkan; 404; body salah 400', async () => {
  const off = await req('/vouchers/1/active', { method: 'PATCH', body: { is_active: false } });
  assert.deepEqual([off.status, off.json.data.is_active, off.json.data.quota], [200, false, 50]);
  assert.deepEqual(ops.filter((o) => o.startsWith('voucher.updateMany')), ['voucher.updateMany:isActive']);
  assert.equal((await req('/vouchers/3/active', { method: 'PATCH', body: { is_active: true } })).json.data.is_active, true);
  assert.equal((await req('/vouchers/404/active', { method: 'PATCH', body: { is_active: true } })).status, 404);
  const bad = await req('/vouchers/1/active', { method: 'PATCH', body: { is_active: 'false' } });
  assert.deepEqual([bad.status, bad.json.message], [400, 'Status aktif tidak valid.']);
});

test('aturan loyalty: GET 5 field angka; PUT mengunci store_settings lalu hanya 5 kolom; tidak sah → fieldErrors tanpa menulis', async () => {
  assert.deepEqual((await req('/loyalty')).json.data, { earn_amount_per_point: 1000, redeem_points_unit: 100, redeem_value: 5000, gold_min_points: 500, platinum_min_points: 2000 });

  ops = [];
  const body = { earn_amount_per_point: '2000', redeem_points_unit: '50', redeem_value: '2500', gold_min_points: '300', platinum_min_points: '1500' };
  const { status, json } = await req('/loyalty', { method: 'PUT', body });
  assert.equal(status, 200);
  assert.deepEqual(json.data, { earn_amount_per_point: 2000, redeem_points_unit: 50, redeem_value: 2500, gold_min_points: 300, platinum_min_points: 1500 });
  assert.deepEqual(ops, ['tx:begin', 'lock:store_settings', 'storeSetting.updateMany:earnAmountPerPoint,goldMinPoints,platinumMinPoints,redeemPointsUnit,redeemValue']);
  assert.deepEqual([db.storeSetting.storeName, db.storeSetting.reviewBonusPoints], ['Oven & Co.', 20]); // field lain utuh

  ops = [];
  const bad = await req('/loyalty', { method: 'PUT', body: { ...body, platinum_min_points: '300', redeem_points_unit: '1.5' } });
  assert.deepEqual([bad.status, bad.json.fieldErrors], [400, {
    redeem_points_unit: 'Poin per penukaran berupa bilangan bulat lebih dari 0', platinum_min_points: 'Ambang Platinum harus lebih besar dari ambang Gold',
  }]);
  assert.deepEqual(ops, []); // validasi sebelum transaksi
  assert.equal((await req('/loyalty', { method: 'PUT', body: { gold_min_points: true } })).json.message, 'Data permintaan tidak valid.');
});

test('product_id BIGINT: valid & tepat batas → 201; di atas batas & format tidak sah → 400 fieldErrors.product_id tanpa query produk', async () => {
  db.products.push({ productId: 9223372036854775807n, name: 'Produk Batas', isActive: true });
  const ok = await req('/vouchers', { method: 'POST', body: form({ code: 'BATASOK', product_id: '9223372036854775807' }) });
  assert.deepEqual([ok.status, ok.json.data?.product_id], [201, '9223372036854775807']);
  const valid = await req('/vouchers', { method: 'POST', body: form({ code: 'VALIDOK', product_id: 4 }) }); // angka aman tetap diterima
  assert.deepEqual([valid.status, valid.json.data?.product_id], [201, '4']);

  const bad = [
    form({ code: 'LEWAT1', product_id: '9223372036854775808' }), // satu di atas batas
    form({ code: 'LEWAT2', product_id: '99999999999999999999' }),
    form({ code: 'FORMAT1', product_id: 'abc' }),
    form({ code: 'FORMAT2', product_id: '1.5' }),
    form({ code: 'FORMAT3', product_id: '-4' }),
    form({ code: 'FORMAT4', product_id: '04' }),
  ];
  for (const body of bad) {
    ops = [];
    const r = await req('/vouchers', { method: 'POST', body });
    assert.deepEqual([r.status, r.json.fieldErrors], [400, { product_id: 'Produk tidak ditemukan' }], body.product_id);
    assert.ok(!ops.includes('product.findUnique'), `query produk tidak boleh dijalankan untuk ${body.product_id}`);
  }
  // angka JSON di luar safe integer (presisi hilang saat parse) → 400, bukan produk lain
  ops = [];
  const unsafe = await req('/vouchers', { method: 'POST', body: JSON.stringify(form({ code: 'UNSAFE' })).replace('"product_id":""', '"product_id":9007199254740993') });
  assert.deepEqual([unsafe.status, unsafe.json.fieldErrors], [400, { product_id: 'Produk tidak ditemukan' }]);
  assert.ok(!ops.includes('product.findUnique'));
  // PUT juga memakai aturan yang sama
  const put = await req('/vouchers/1', { method: 'PUT', body: form({ code: 'WEEKEND15', quota: '50', product_id: '9223372036854775808' }) });
  assert.deepEqual([put.status, put.json.fieldErrors], [400, { product_id: 'Produk tidak ditemukan' }]);
  assert.equal(db.vouchers.filter((x) => ['LEWAT1', 'LEWAT2', 'FORMAT1', 'FORMAT2', 'FORMAT3', 'FORMAT4', 'UNSAFE'].includes(x.code)).length, 0);
});
