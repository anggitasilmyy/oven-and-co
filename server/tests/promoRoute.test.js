// Regresi tingkat HTTP: GET /api/promos/active (FR-05 · C-05 Beranda) — publik, bentuk sama dengan mock client
// services/promoService.js, aturan aktif (is_active, kuota tersisa, dalam periode WIB, batas inklusif), data kosong,
// dan error database. Prisma dipalsukan (tabel vouchers di memori); server Express di port acak lalu ditutup.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');
const { getJakartaDateKey, addDaysToDateKey, dateKeyToDbDate } = require('../src/utils/jakartaDate');

process.env.JWT_SECRET = 'test-secret-only';

const app = require('../src/app');
const promoService = require('../src/services/promo.service');

const today = getJakartaDateKey();
const day = (offset) => dateKeyToDbDate(addDaysToDateKey(today, offset));

const products = {
  1: {
    name: 'Classic Butter Croissant',
    images: [
      { imageId: 12n, imageUrl: '/c-1b.webp', sortOrder: 2 },
      { imageId: 11n, imageUrl: '/c-1a.webp', sortOrder: 1 },
    ],
  },
  4: { name: 'Assorted Cookies Box', images: [] },
};

const voucher = (overrides) => ({
  title: 'Promo', discountType: 'percent', discountValue: 15, productId: null,
  quota: 10, validFrom: day(-2), validTo: day(5), isActive: true,
  ...overrides,
});

const allVouchers = [
  voucher({ voucherId: 2n, code: 'HEMAT10', title: 'Hemat Rp 10.000', discountType: 'amount', discountValue: 10000 }),
  voucher({ voucherId: 1n, code: 'WEEKEND15', productId: 4n }),
  voucher({ voucherId: 3n, code: 'CROISSANT20', productId: 1n, discountValue: 20 }),
  voucher({ voucherId: 4n, code: 'MULAIHARIINI', validFrom: day(0) }),
  voucher({ voucherId: 5n, code: 'AKHIRHARIINI', validTo: day(0) }),
  voucher({ voucherId: 6n, code: 'NONAKTIF', isActive: false }),
  voucher({ voucherId: 7n, code: 'KUOTAHABIS', quota: 0 }),
  voucher({ voucherId: 8n, code: 'BELUMMULAI', validFrom: day(1) }),
  voucher({ voucherId: 9n, code: 'SUDAHLEWAT', validFrom: day(-10), validTo: day(-1) }),
];

let vouchers = [];
let lastQuery = null;
let failWith = null;

fakePrisma.voucher = {
  findMany: async (query) => {
    lastQuery = query;
    if (failWith) throw failWith;
    return vouchers
      .filter((v) => matchesWhere(v, query.where))
      .sort((a, b) => (a.voucherId < b.voucherId ? -1 : 1))
      .map((v) => {
        const product = v.productId == null ? null : products[String(v.productId)];
        return {
          ...v,
          product: product && {
            name: product.name,
            images: [...product.images]
              .sort((a, b) => a.sortOrder - b.sortOrder || (a.imageId < b.imageId ? -1 : 1))
              .slice(0, query.include.product.select.images.take)
              .map(({ imageUrl }) => ({ imageUrl })),
          },
        };
      });
  },
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/promos`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  vouchers = allVouchers.map((v) => ({ ...v }));
  lastQuery = null;
  failWith = null;
});

const call = async (path = '/active', { method = 'GET', headers = {} } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers });
  return { status: res.status, json: await res.json() };
};

test('tamu (tanpa token) → 200 dengan bentuk sama seperti mock client', async () => {
  const { status, json } = await call();

  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.deepEqual(json.data[0], {
    voucher_id: '1',
    code: 'WEEKEND15',
    title: 'Promo',
    discount_type: 'percent',
    discount_value: 15,
    valid_to: addDaysToDateKey(today, 5),
    product_id: '4',
    product_name: 'Assorted Cookies Box',
    image_url: null,
  });
});

test('hanya voucher aktif: is_active, kuota > 0, valid_from ≤ hari ini ≤ valid_to (inklusif), urut voucher_id', async () => {
  const { json } = await call();

  assert.deepEqual(json.data.map((p) => p.code), ['WEEKEND15', 'HEMAT10', 'CROISSANT20', 'MULAIHARIINI', 'AKHIRHARIINI']);
  // Query sudah memangkas nonaktif & yang berakhir; sisanya diputus aturan bersama checkout
  assert.deepEqual(lastQuery.where, { isActive: true, validTo: { gte: day(0) } });
});

test('voucher semua produk → product_id/product_name/image_url null; produk → foto pertama menurut sort_order', async () => {
  const { json } = await call();
  const byCode = Object.fromEntries(json.data.map((p) => [p.code, p]));

  assert.equal(byCode.HEMAT10.product_id, null);
  assert.equal(byCode.HEMAT10.product_name, null);
  assert.equal(byCode.HEMAT10.image_url, null);
  assert.equal(byCode.HEMAT10.discount_type, 'amount');
  assert.equal(byCode.HEMAT10.discount_value, 10000);
  assert.equal(byCode.CROISSANT20.product_name, 'Classic Butter Croissant');
  assert.equal(byCode.CROISSANT20.image_url, '/c-1a.webp');
});

test('tidak ada promo aktif → 200 dengan data [] (banner disembunyikan di client)', async () => {
  vouchers = vouchers.filter((v) => ['NONAKTIF', 'KUOTAHABIS', 'BELUMMULAI', 'SUDAHLEWAT'].includes(v.code));
  assert.deepEqual(await call(), { status: 200, json: { status: 'success', data: [] } });

  vouchers = [];
  assert.deepEqual(await call(), { status: 200, json: { status: 'success', data: [] } });
});

test('token rusak dari client login tetap 200 — endpoint publik tidak memeriksa token', async () => {
  const { status, json } = await call('/active', { headers: { Authorization: 'Bearer bukan-token' } });

  assert.equal(status, 200);
  assert.equal(json.data.length, 5);
});

test('"hari ini" dihitung WIB: 28 Okt 18.00 UTC = 29 Okt WIB → voucher berakhir 28 Okt tidak aktif', async () => {
  vouchers = [
    voucher({ voucherId: 1n, code: 'BERAKHIR28', validFrom: dateKeyToDbDate('2026-10-20'), validTo: dateKeyToDbDate('2026-10-28') }),
    voucher({ voucherId: 2n, code: 'MULAI29', validFrom: dateKeyToDbDate('2026-10-29'), validTo: dateKeyToDbDate('2026-10-30') }),
  ];

  const promos = await promoService.getActivePromos(new Date('2026-10-28T18:00:00Z'));

  assert.deepEqual(promos.map((p) => p.code), ['MULAI29']);
});

test('database gagal → 500 dengan pesan umum, detail internal tidak bocor', async (t) => {
  t.mock.method(console, 'error', () => {});
  failWith = Object.assign(new Error('Can\'t reach database server at localhost:3306'), { code: 'P1001' });

  const { status, json } = await call();

  assert.equal(status, 500);
  assert.deepEqual(json, { status: 'error', message: 'Terjadi kesalahan pada server.' });
});

test('hanya GET /active: metode atau path lain → 404', async () => {
  assert.equal((await call('/active', { method: 'POST' })).status, 404);
  assert.equal((await call('')).status, 404);
});
