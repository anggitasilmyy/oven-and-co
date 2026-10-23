// Regresi: kontrak respons kategori & produk sama dengan service frontend (audit Step 6.3 · C-1, C-2, C-9)
// Prisma dipalsukan — tidak ada query ke MySQL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fakePrisma = require('./helpers/fakePrisma');
const { getCategories } = require('../src/services/category.service');
const productService = require('../src/services/product.service');

const croissant = {
  productId: 1n, categoryId: 3, name: 'Classic Butter Croissant', description: 'Renyah', ingredients: 'Tepung',
  allergens: 'Gluten', price: 28000, availabilityType: 'ready', leadTimeDays: 0, isActive: true,
  category: { categoryId: 3, name: 'Pastry' },
  images: [{ imageUrl: '/c-1.webp' }, { imageUrl: '/c-2.webp' }],
  dailyStocks: [{ qtyPlanned: 40, qtySold: 0 }],
  variants: [{ variantId: 7n, productId: 1n, name: 'Isi 2', extraPrice: 26000, isActive: true }],
};
const customCake = {
  ...croissant, productId: 6n, categoryId: 5, name: 'Custom Celebration Cake', availabilityType: 'custom',
  leadTimeDays: 3, price: 450000, category: { categoryId: 5, name: 'Custom Cake' }, dailyStocks: [], variants: [],
};

let lastProductQuery = null;

fakePrisma.category = {
  findMany: async () => [{ categoryId: 1, name: 'Roti', sortOrder: 1 }],
};
fakePrisma.product = {
  findMany: async (args) => {
    lastProductQuery = args;
    return [croissant, customCake].filter((p) => !args.where.availabilityType || p.availabilityType === args.where.availabilityType);
  },
  findFirst: async ({ where }) => [croissant, customCake].find((p) => p.productId === where.productId) ?? null,
};
fakePrisma.review = {
  findMany: async ({ include }) =>
    include
      ? [{
          reviewId: 5n, rating: 4, tags: 'Renyah, Segar', comment: 'Enak', adminReply: null,
          createdAt: new Date('2026-10-20T02:00:00.000Z'), user: { name: 'Rina Wulandari' },
          photos: [{ photoUrl: '/r.webp' }], orderItem: { variant: { name: 'Isi 2' } },
        }]
      : [{ rating: 4, orderItem: { productId: 1n } }],
};
fakePrisma.order = {
  findMany: async () => [{ items: [{ productId: 1n, quantity: 3 }] }],
};
fakePrisma.storeSetting = {
  findFirst: async () => ({ preorderCutoffTime: new Date('1970-01-01T17:00:00.000Z') }),
};

test('GET /categories → array {category_id, name, sort_order}', async () => {
  assert.deepEqual(await getCategories(), [{ category_id: 1, name: 'Roti', sort_order: 1 }]);
});

test('GET /products → array product view snake_case + sold_count, tanpa pembungkus pagination', async () => {
  const result = await productService.getProducts({});

  assert.ok(Array.isArray(result));
  assert.deepEqual(result[0], {
    product_id: '1', name: 'Classic Butter Croissant', price: 28000, category_id: 3, category_name: 'Pastry',
    availability_type: 'ready', lead_time_days: 0, is_active: true, image_url: '/c-1.webp',
    rating: { average: 4, count: 1 }, remaining_today: 40, sold_count: 3,
  });
  // tanpa limit: semua produk aktif (katalog memfilter di frontend)
  assert.equal(lastProductQuery.take, undefined);
  // rating tanpa ulasan → average null (sama dengan mock)
  assert.deepEqual(result[1].rating, { average: null, count: 0 });
  assert.equal(result[1].remaining_today, null);
});

test('GET /products?type=custom hanya mengambil produk custom', async () => {
  const result = await productService.getProducts({ type: 'custom' });

  assert.equal(lastProductQuery.where.availabilityType, 'custom');
  assert.deepEqual(result.map((p) => p.product_id), ['6']);
  await assert.rejects(productService.getProducts({ type: 'kue' }), { statusCode: 400 });
});

test('GET /products?search= mencocokkan setiap kata pada nama produk atau kategori', async () => {
  await productService.getProducts({ search: '  butter  pastry ' });

  assert.deepEqual(lastProductQuery.where.AND, [
    { OR: [{ name: { contains: 'butter' } }, { category: { is: { name: { contains: 'butter' } } } }] },
    { OR: [{ name: { contains: 'pastry' } }, { category: { is: { name: { contains: 'pastry' } } } }] },
  ]);
});

test('GET /products/:id → detail sesuai productDetailService', async () => {
  // 22 Okt 2026 10.00 WIB
  const detail = await productService.getProductById('1', new Date('2026-10-22T03:00:00.000Z'));

  assert.equal(detail.product_id, '1');
  assert.deepEqual(detail.images, ['/c-1.webp', '/c-2.webp']);
  assert.deepEqual(detail.variants, [{ variant_id: '7', product_id: '1', name: 'Isi 2', extra_price: 26000, is_active: true }]);
  assert.equal(detail.today_key, '2026-10-22');
  assert.equal(detail.earliest_ready_date, '2026-10-22');
  assert.equal(detail.preorder_cutoff_time, '17:00');
  assert.equal(detail.rating_summary.average, 4);
  assert.equal(detail.rating_summary.withPhotoCount, 1);
  assert.equal(detail.review_preview[0].reviewer_name, 'Rina W.');
  assert.deepEqual(detail.review_preview[0].tags, ['Renyah', 'Segar']);
  assert.equal('productId' in detail, false);
});

test('GET /products/:id tidak ada → 404, id tidak valid → 400', async () => {
  await assert.rejects(productService.getProductById('404'), { statusCode: 404 });
  await assert.rejects(productService.getProductById('abc'), { statusCode: 400 });
});

test('fresh-today & best-sellers tetap berbentuk product view', async () => {
  const fresh = await productService.getFreshFromOvenToday({});
  assert.deepEqual(fresh.map((p) => p.product_id), ['1']);
  assert.equal(fresh[0].remaining_today, 40);

  const best = await productService.getBestSellers({ limit: '5' });
  assert.equal(best[0].product_id, '1');
  assert.equal(best[0].quantity_sold, 3);
  await assert.rejects(productService.getBestSellers({ limit: '51' }), { statusCode: 400 });
});
