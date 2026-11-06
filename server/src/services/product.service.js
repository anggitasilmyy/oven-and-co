// services/product.service.js
// FR-05 · FR-06 · FR-07 · FR-08 · FR-09 · BR-01 · BR-02 — katalog, detail produk, Fresh from Oven, Best Sellers.
// Bentuk respons mengikuti service frontend (catalogService, productDetailService, productService):
// array product view snake_case, id BIGINT sebagai string.

const prisma = require('../lib/prisma');
const {
  AVAILABILITY_TYPE,
  API_ERROR_CODE,
  SALES_WINDOW_DAYS,
  REVIEW_PREVIEW_LIMIT,
} = require('../utils/businessConstants');
const {
  getJakartaDateKey,
  addDaysToDateKey,
  dateKeyToDbDate,
  formatTime,
} = require('../utils/jakartaDate');
const { getEarliestReadyDate } = require('./readyDate.service');
const {
  productCardInclude,
  getRemainingToday,
  getProductRatings,
  getSalesTotals,
  toProductView,
  getProductReviewViews,
  summarizeRatings,
} = require('./productView.service');

const VALID_AVAILABILITY = new Set(Object.values(AVAILABILITY_TYPE));
const SEARCH_MAX_LENGTH = 100;
const LIMIT_MAX = 50;
const PRISMA_INT_MAX = 2147483647; // batas Int 32-bit untuk argumen skip Prisma

const SORT_OPTIONS = {
  default: [{ productId: 'asc' }],
  price_asc: [{ price: 'asc' }, { productId: 'asc' }],
  price_desc: [{ price: 'desc' }, { productId: 'asc' }],
  name_asc: [{ name: 'asc' }, { productId: 'asc' }],
  name_desc: [{ name: 'desc' }, { productId: 'asc' }],
};

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readString(value, fieldName) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw httpError(400, `Parameter ${fieldName} tidak valid.`);
  }

  return value;
}

function parsePositiveInteger(value, fieldName, defaultValue) {
  const raw = readString(value, fieldName);

  if (raw === undefined) return defaultValue;

  if (!/^[1-9]\d*$/.test(raw)) {
    throw httpError(400, `Parameter ${fieldName} harus berupa bilangan bulat positif.`);
  }

  const parsed = Number(raw);

  if (!Number.isSafeInteger(parsed)) {
    throw httpError(400, `Parameter ${fieldName} terlalu besar.`);
  }

  return parsed;
}

function parseLimit(value, defaultValue) {
  const limit = parsePositiveInteger(value, 'limit', defaultValue);

  if (limit !== undefined && limit > LIMIT_MAX) {
    throw httpError(400, `Parameter limit maksimal ${LIMIT_MAX}.`);
  }

  return limit;
}

/** `type` (dipakai frontend) atau `availabilityType` */
function parseAvailability(query) {
  const raw = readString(query.type ?? query.availabilityType, 'type');
  const value = raw?.trim() || undefined;

  if (value !== undefined && !VALID_AVAILABILITY.has(value)) {
    throw httpError(400, 'type harus ready, preorder, atau custom.');
  }

  return value;
}

/** FR-07: setiap kata kunci harus muncul pada nama produk atau nama kategori (sama dengan searchCatalog) */
function buildSearchFilter(search) {
  const keywords = search.split(/\s+/).filter(Boolean);

  return keywords.map((keyword) => ({
    OR: [
      { name: { contains: keyword } },
      { category: { is: { name: { contains: keyword } } } },
    ],
  }));
}

function getTodayContext(now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  return { now, todayKey, todayDate: dateKeyToDbDate(todayKey) };
}

/**
 * GET /api/products — produk aktif (FR-06) + sold_count 7 hari untuk urutan "Terlaris".
 * Tanpa `limit` semua produk aktif dikirim (katalog memfilter & mengurutkan di frontend).
 */
async function getProducts(query = {}) {
  const search = readString(query.search ?? query.q, 'search')?.trim() || '';

  if (search.length > SEARCH_MAX_LENGTH) {
    throw httpError(400, `Pencarian maksimal ${SEARCH_MAX_LENGTH} karakter.`);
  }

  const categoryId = parsePositiveInteger(query.categoryId, 'categoryId', undefined);
  const availabilityType = parseAvailability(query);
  const limit = parseLimit(query.limit, undefined);
  const page = parsePositiveInteger(query.page, 'page', 1);
  const sort = readString(query.sort, 'sort')?.trim() || 'default';

  if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)) {
    throw httpError(400, 'sort harus default, price_asc, price_desc, name_asc, atau name_desc.');
  }

  const { todayKey, todayDate } = getTodayContext();
  const where = {
    isActive: true,
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(availabilityType ? { availabilityType } : {}),
    ...(search ? { AND: buildSearchFilter(search) } : {}),
  };

  const skip = limit !== undefined ? (page - 1) * limit : 0;

  // Offset harus bilangan aman dan muat di Int Prisma; selain itu 400 (bukan 500 dari Prisma)
  if (!Number.isSafeInteger(skip) || skip > PRISMA_INT_MAX) {
    throw httpError(400, 'Kombinasi page dan limit terlalu besar.');
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: SORT_OPTIONS[sort],
    ...(limit !== undefined ? { skip, take: limit } : {}),
    include: productCardInclude(todayDate),
  });

  const productIds = rows.map((row) => row.productId);
  const [ratings, sold] = await Promise.all([
    getProductRatings(productIds),
    getSalesTotals(addDaysToDateKey(todayKey, -(SALES_WINDOW_DAYS - 1)), todayKey),
  ]);

  return rows.map((row) => ({
    ...toProductView(row, ratings),
    sold_count: sold.get(String(row.productId)) ?? 0,
  }));
}

/** GET /api/products/:id — detail produk aktif (FR-08, FR-09); 404 bila tidak ada/nonaktif */
async function getProductById(id, now = new Date()) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    // Kode INVALID_ID: frontend memperlakukannya seperti "tidak ditemukan" (sama dengan mode mock)
    throw Object.assign(httpError(400, 'ID produk tidak valid.'), { apiCode: API_ERROR_CODE.INVALID_ID });
  }

  const productId = BigInt(id);
  const { todayKey, todayDate } = getTodayContext(now);

  const [product, settings] = await Promise.all([
    prisma.product.findFirst({
      where: { productId, isActive: true },
      include: {
        ...productCardInclude(todayDate),
        images: {
          orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }],
          select: { imageUrl: true },
        },
        variants: {
          where: { isActive: true },
          orderBy: { variantId: 'asc' },
        },
      },
    }),
    prisma.storeSetting.findFirst({
      orderBy: { settingId: 'asc' },
      select: { preorderCutoffTime: true },
    }),
  ]);

  if (!product) {
    throw httpError(404, 'Produk tidak ditemukan.');
  }

  const reviews = await getProductReviewViews(productId);
  const ratingSummary = summarizeRatings(reviews);
  const ratings = new Map([[id, { average: ratingSummary.average, count: ratingSummary.count }]]);

  return {
    ...toProductView(product, ratings),
    description: product.description,
    ingredients: product.ingredients,
    allergens: product.allergens,
    images: product.images.map((image) => image.imageUrl),
    variants: product.variants.map((variant) => ({
      variant_id: String(variant.variantId),
      product_id: String(variant.productId),
      name: variant.name,
      extra_price: Number(variant.extraPrice),
      is_active: variant.isActive,
    })),
    today_key: todayKey,
    // BR-01/BR-02: dihitung dari lead_time_days & store_settings.preorder_cutoff_time
    earliest_ready_date: getEarliestReadyDate(product, now, settings),
    preorder_cutoff_time: formatTime(settings?.preorderCutoffTime),
    rating_summary: ratingSummary,
    review_preview: reviews.slice(0, REVIEW_PREVIEW_LIMIT),
  };
}

/** FR-05 · BR-01 — GET /api/products/fresh-today: produk ready dengan stok tersisa hari ini */
async function getFreshFromOvenToday(query = {}) {
  const limit = parseLimit(query.limit, 5);
  const { todayDate } = getTodayContext();

  const rows = await prisma.product.findMany({
    where: { isActive: true, availabilityType: AVAILABILITY_TYPE.READY },
    include: productCardInclude(todayDate),
    orderBy: { productId: 'asc' },
  });

  const available = rows
    .map((product) => ({ product, remaining: getRemainingToday(product) }))
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) =>
      b.remaining - a.remaining ||
      (a.product.productId < b.product.productId ? -1 : a.product.productId > b.product.productId ? 1 : 0)
    )
    .slice(0, limit)
    .map((entry) => entry.product);

  const ratings = await getProductRatings(available.map((product) => product.productId));

  return available.map((product) => toProductView(product, ratings));
}

/**
 * FR-05 · FR-27 — GET /api/products/best-sellers
 * Penjualan dari pesanan lunas & tidak dibatalkan, tujuh hari kalender WIB terakhir termasuk hari ini.
 * `now` & `db` opsional (Step 6.4.6): Dashboard AD-02 memakai waktu yang sama dan klien transaksi snapshot bacanya
 * (semua query di fungsi ini lewat `db`); pemanggil lain memakai default (jam sekarang, Prisma global).
 */
async function getBestSellers(query = {}, now = new Date(), db = prisma) {
  const limit = parseLimit(query.limit, 5);
  const { todayKey, todayDate } = getTodayContext(now);
  const totals = await getSalesTotals(addDaysToDateKey(todayKey, -(SALES_WINDOW_DAYS - 1)), todayKey, db);

  const ranked = [...totals.entries()]
    .map(([productId, quantity]) => ({ productId: BigInt(productId), quantity }))
    .sort((a, b) =>
      b.quantity - a.quantity ||
      (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
    );

  if (ranked.length === 0) return [];

  // Produk nonaktif disaring SEBELUM dipotong ke `limit`, agar posisinya diisi produk terlaris berikutnya.
  // Langkah 1 hanya mengambil id produk aktif; relasi (foto, stok) baru dimuat untuk `limit` produk teratas.
  const activeRows = await db.product.findMany({
    where: { isActive: true, productId: { in: ranked.map((item) => item.productId) } },
    select: { productId: true },
  });
  const activeIds = new Set(activeRows.map((row) => String(row.productId)));
  const topItems = ranked.filter((item) => activeIds.has(String(item.productId))).slice(0, limit);

  if (topItems.length === 0) return [];

  const products = await db.product.findMany({
    where: { isActive: true, productId: { in: topItems.map((item) => item.productId) } },
    include: productCardInclude(todayDate),
  });

  const productById = new Map(products.map((product) => [String(product.productId), product]));
  const top = topItems
    .map((item) => ({ item, product: productById.get(String(item.productId)) }))
    .filter((entry) => entry.product);

  const ratings = await getProductRatings(top.map((entry) => entry.product.productId), db);

  return top.map(({ item, product }) => ({ ...toProductView(product, ratings), quantity_sold: item.quantity }));
}

module.exports = {
  getProducts,
  getProductById,
  getFreshFromOvenToday,
  getBestSellers,
};
