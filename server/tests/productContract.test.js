// Regresi: kontrak respons kategori & produk sama dengan service frontend (audit Step 6.3 · C-1, C-2, C-9)
// Review 49a1214 (M5): fake Prisma menerapkan `where` (tests/helpers/whereMatch.js) sehingga filter produk aktif,
// status bayar, status pesanan, dan rentang tanggal diverifikasi lewat HASIL, bukan bentuk query.
// Prisma dipalsukan — tidak ada query ke MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');
const { matchesWhere } = require('./helpers/whereMatch');
const { getCategories } = require('../src/services/category.service');
const productService = require('../src/services/product.service');

const product = (overrides) => ({
  categoryId: 3, description: 'Renyah', ingredients: 'Tepung', allergens: 'Gluten', price: 28000,
  availabilityType: 'ready', leadTimeDays: 0, isActive: true, category: { categoryId: 3, name: 'Pastry' },
  images: [{ imageUrl: '/c-1.webp' }, { imageUrl: '/c-2.webp' }], dailyStocks: [{ qtyPlanned: 40, qtySold: 0 }],
  variants: [],
  ...overrides,
});

const products = [
  product({
    productId: 1n, name: 'Classic Butter Croissant',
    variants: [{ variantId: 7n, productId: 1n, name: 'Isi 2', extraPrice: 26000, isActive: true }],
  }),
  product({ productId: 2n, name: 'Cinnamon Roll', categoryId: 1, category: { categoryId: 1, name: 'Roti' } }),
  product({ productId: 3n, name: 'Roti Lama Nonaktif', isActive: false }),
  product({
    productId: 6n, categoryId: 5, name: 'Custom Celebration Cake', availabilityType: 'custom', leadTimeDays: 3,
    price: 450000, category: { categoryId: 5, name: 'Custom Cake' }, dailyStocks: [],
  }),
];

const at = (iso) => new Date(iso);
// "Hari ini" uji = waktu nyata; pesanan contoh dibuat relatif terhadap sekarang
const NOW = Date.now();
const daysAgo = (days) => new Date(NOW - days * 86400000);

const orders = [
  // Terjual di jendela 7 hari, lunas, tidak batal → dihitung
  { paymentStatus: 'paid', orderStatus: 'selesai', createdAt: daysAgo(1), items: [{ productId: 1n, quantity: 3 }] },
  { paymentStatus: 'paid', orderStatus: 'dikonfirmasi', createdAt: daysAgo(0), items: [{ productId: 2n, quantity: 2 }] },
  // Produk nonaktif paling laris → tidak boleh mengurangi jumlah hasil (L6)
  { paymentStatus: 'paid', orderStatus: 'selesai', createdAt: daysAgo(2), items: [{ productId: 3n, quantity: 50 }] },
  { paymentStatus: 'paid', orderStatus: 'selesai', createdAt: daysAgo(2), items: [{ productId: 6n, quantity: 1 }] },
  // Tidak dihitung: belum lunas, dibatalkan, di luar jendela 7 hari
  { paymentStatus: 'unpaid', orderStatus: 'menunggu_pembayaran', createdAt: daysAgo(0), items: [{ productId: 2n, quantity: 90 }] },
  { paymentStatus: 'paid', orderStatus: 'dibatalkan', createdAt: daysAgo(0), items: [{ productId: 6n, quantity: 90 }] },
  { paymentStatus: 'refunded', orderStatus: 'dibatalkan', createdAt: daysAgo(1), items: [{ productId: 1n, quantity: 90 }] },
  { paymentStatus: 'paid', orderStatus: 'selesai', createdAt: daysAgo(30), items: [{ productId: 2n, quantity: 90 }] },
];

const reviews = [
  { rating: 4, isHidden: false, orderItem: { productId: 1n } },
  { rating: 1, isHidden: true, orderItem: { productId: 1n } }, // disembunyikan admin → tidak dihitung
];

let lastProductQuery = null;

fakePrisma.category = {
  findMany: async () => [{ categoryId: 1, name: 'Roti', sortOrder: 1 }],
};
fakePrisma.product = {
  findMany: async (args) => {
    lastProductQuery = args;
    const rows = products.filter((row) => matchesWhere(row, args.where));
    return args.take !== undefined ? rows.slice(args.skip ?? 0, (args.skip ?? 0) + args.take) : rows;
  },
  findFirst: async ({ where }) => products.find((row) => matchesWhere(row, where)) ?? null,
};
fakePrisma.review = {
  findMany: async ({ where, include }) =>
    include
      ? [{
          reviewId: 5n, rating: 4, tags: 'Renyah, Segar', comment: 'Enak', adminReply: null,
          createdAt: at('2026-10-20T02:00:00.000Z'), user: { name: 'Rina Wulandari' },
          photos: [{ photoUrl: '/r.webp' }], orderItem: { variant: { name: 'Isi 2' } },
        }]
      : reviews.filter((row) => matchesWhere(row, where)),
};
fakePrisma.order = {
  findMany: async ({ where }) => orders.filter((row) => matchesWhere(row, where)),
};
fakePrisma.storeSetting = {
  findFirst: async () => ({ preorderCutoffTime: at('1970-01-01T17:00:00.000Z') }),
};

test('GET /categories → array {category_id, name, sort_order}', async () => {
  assert.deepEqual(await getCategories(), [{ category_id: 1, name: 'Roti', sort_order: 1 }]);
});

test('GET /products → hanya produk aktif, snake_case + sold_count dari pesanan lunas & tidak batal', async () => {
  const result = await productService.getProducts({});

  assert.ok(Array.isArray(result));
  assert.deepEqual(result.map((p) => p.product_id), ['1', '2', '6']); // produk 3 nonaktif tidak tampil
  assert.deepEqual(result[0], {
    product_id: '1', name: 'Classic Butter Croissant', price: 28000, category_id: 3, category_name: 'Pastry',
    availability_type: 'ready', lead_time_days: 0, is_active: true, image_url: '/c-1.webp',
    rating: { average: 4, count: 1 }, // ulasan tersembunyi (rating 1) tidak dihitung
    remaining_today: 40, sold_count: 3, // pesanan refunded/dibatalkan (90) tidak dihitung
  });
  // unpaid (90) & di luar 7 hari (90) tidak dihitung
  assert.equal(result[1].sold_count, 2);
  // pesanan dibatalkan walau "paid" (90) tidak dihitung
  assert.equal(result[2].sold_count, 1);
  assert.deepEqual(result[2].rating, { average: null, count: 0 });
  assert.equal(result[2].remaining_today, null);
  assert.equal(lastProductQuery.take, undefined);
});

test('GET /products?type=custom hanya mengambil produk custom aktif', async () => {
  const result = await productService.getProducts({ type: 'custom' });

  assert.deepEqual(result.map((p) => p.product_id), ['6']);
  await assert.rejects(productService.getProducts({ type: 'kue' }), { statusCode: 400 });
});

test('GET /products?search= : setiap kata harus ada di nama produk atau nama kategori', async () => {
  assert.deepEqual((await productService.getProducts({ search: '  butter  pastry ' })).map((p) => p.product_id), ['1']);
  assert.deepEqual((await productService.getProducts({ search: 'roti' })).map((p) => p.product_id), ['2']); // nonaktif tidak
  assert.deepEqual(await productService.getProducts({ search: 'butter roti' }), []);
});

test('regresi M2: offset pagination yang tidak aman → 400, bukan 500', async () => {
  await assert.rejects(
    productService.getProducts({ limit: '50', page: '900719925474099' }),
    { statusCode: 400, message: 'Kombinasi page dan limit terlalu besar.' }
  );
  // offset masih "safe integer" tetapi melebihi Int Prisma
  await assert.rejects(productService.getProducts({ limit: '50', page: '50000000' }), { statusCode: 400 });

  const pageTwo = await productService.getProducts({ limit: '2', page: '2' });
  assert.equal(lastProductQuery.skip, 2);
  assert.deepEqual(pageTwo.map((p) => p.product_id), ['6']);
});

test('GET /products/:id → detail sesuai productDetailService; produk nonaktif → 404', async () => {
  // 22 Okt 2026 10.00 WIB
  const detail = await productService.getProductById('1', at('2026-10-22T03:00:00.000Z'));

  assert.equal(detail.product_id, '1');
  assert.deepEqual(detail.images, ['/c-1.webp', '/c-2.webp']);
  assert.deepEqual(detail.variants, [{ variant_id: '7', product_id: '1', name: 'Isi 2', extra_price: 26000, is_active: true }]);
  assert.equal(detail.today_key, '2026-10-22');
  assert.equal(detail.earliest_ready_date, '2026-10-22');
  assert.equal(detail.preorder_cutoff_time, '17:00');
  assert.equal(detail.rating_summary.average, 4);
  assert.equal(detail.review_preview[0].reviewer_name, 'Rina W.');
  assert.equal('productId' in detail, false);

  await assert.rejects(productService.getProductById('3'), { statusCode: 404 }); // ada tetapi nonaktif
});

test('GET /products/:id tidak ada → 404, id tidak valid → 400', async () => {
  await assert.rejects(productService.getProductById('404'), { statusCode: 404 });
  for (const id of ['abc', '0', '-1', '1.5']) {
    await assert.rejects(productService.getProductById(id), { statusCode: 400 });
  }
});

test('fresh-today: hanya produk ready aktif dengan stok tersisa', async () => {
  const fresh = await productService.getFreshFromOvenToday({});
  assert.deepEqual(fresh.map((p) => p.product_id), ['1', '2']); // 3 nonaktif, 6 custom
});

test('regresi L6: best sellers mengisi posisi produk nonaktif dengan produk terlaris berikutnya', async () => {
  // Urutan terjual: 3 (50, nonaktif) > 1 (3) > 2 (2) > 6 (1)
  const top2 = await productService.getBestSellers({ limit: '2' });
  assert.deepEqual(top2.map((p) => [p.product_id, p.quantity_sold]), [['1', 3], ['2', 2]]);

  const all = await productService.getBestSellers({ limit: '5' });
  assert.deepEqual(all.map((p) => p.product_id), ['1', '2', '6']);
  await assert.rejects(productService.getBestSellers({ limit: '51' }), { statusCode: 400 });
});
