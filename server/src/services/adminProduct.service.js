// services/adminProduct.service.js
// Step 6.4 · FR-30 · UC-23 · AD-06 — data produk untuk admin (Staf & Owner): tabel produk, isi form ubah, dan toggle
// aktif. Kontrak = client services/mock/adminCatalogViews.js (buildAdminProductRows, buildAdminProductForm) &
// adminCatalogWrites.js (setAdminProductActive). Berbeda dengan katalog pelanggan, produk NONAKTIF ikut tampil.
// Simpan produk (form + foto + varian) ada di adminProductSave.service.js.

const prisma = require('../lib/prisma');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { getProductRatings, toProductView } = require('./productView.service');
const { normalizeProductInput, validateProduct, validationError } = require('./adminCatalogRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');

const NOT_FOUND_MESSAGE = 'Produk tidak ditemukan.';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const imageOrder = [{ sortOrder: 'asc' }, { imageId: 'asc' }];

const mapCategory = (c) => ({ category_id: c.categoryId, name: c.name, sort_order: c.sortOrder });

const mapVariant = (v) => ({
  variant_id: String(v.variantId),
  product_id: String(v.productId),
  name: v.name,
  extra_price: Number(v.extraPrice),
  is_active: v.isActive,
});

/** Kolom produk snake_case (bentuk tabel mock) */
const mapProductColumns = (p) => ({
  product_id: String(p.productId),
  category_id: p.categoryId,
  name: p.name,
  description: p.description,
  ingredients: p.ingredients ?? null,
  allergens: p.allergens ?? null,
  price: Number(p.price),
  availability_type: p.availabilityType,
  lead_time_days: p.leadTimeDays,
  is_active: p.isActive,
});

/** Konteks validasi validateProduct: kategori & status semua produk (bentuk snake_case) */
async function loadValidationContext(client) {
  const [categories, products] = await Promise.all([
    client.category.findMany({ select: { categoryId: true, name: true } }),
    client.product.findMany({ select: { productId: true, isActive: true, availabilityType: true } }),
  ]);
  return {
    categories: categories.map((c) => ({ category_id: c.categoryId, name: c.name })),
    products: products.map((p) => ({ product_id: String(p.productId), is_active: p.isActive, availability_type: p.availabilityType })),
  };
}

/**
 * GET /api/admin/products — { rows, categories }. Baris = tampilan produk katalog (toProductView) + has_stock_today
 * + photo_count; urut kategori (sort_order) lalu id agar produk sejenis berdekatan.
 */
async function getAdminProducts(now = new Date()) {
  const todayDate = dateKeyToDbDate(getJakartaDateKey(now));
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true, sortOrder: true } },
        images: { orderBy: imageOrder, select: { imageUrl: true } },
        dailyStocks: { where: { stockDate: todayDate }, take: 1 },
      },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { categoryId: 'asc' }] }),
  ]);
  const ratings = await getProductRatings(products.map((p) => p.productId));

  const rows = [...products]
    .sort((a, b) => (a.category?.sortOrder ?? 99) - (b.category?.sortOrder ?? 99) || (a.productId < b.productId ? -1 : 1))
    .map((p) => ({
      ...toProductView(p, ratings),
      has_stock_today: p.dailyStocks.length > 0,
      photo_count: p.images.length,
    }));

  return { rows, categories: categories.map(mapCategory) };
}

/** GET /api/admin/products/:id — isi form ubah: kolom produk + foto (urut sort_order) + semua varian (termasuk nonaktif) */
async function getAdminProduct(productId) {
  const product = await prisma.product.findUnique({
    where: { productId: BigInt(productId) },
    include: {
      images: { orderBy: imageOrder, select: { imageId: true, imageUrl: true } },
      variants: { orderBy: { variantId: 'asc' } },
    },
  });
  if (!product) throw httpError(404, NOT_FOUND_MESSAGE);

  return {
    ...mapProductColumns(product),
    photos: product.images.map((img) => ({ image_id: String(img.imageId), image_url: img.imageUrl })),
    variants: product.variants.map(mapVariant),
  };
}

/**
 * PATCH /api/admin/products/:id/active — toggle dari tabel dengan aturan yang sama dengan form (mis. satu produk
 * custom cake aktif). Diserialkan dengan kunci master data agar dua aktivasi custom bersamaan tidak sama-sama lolos.
 */
async function setProductActive(productId, isActive) {
  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    const product = await tx.product.findUnique({ where: { productId: BigInt(productId) }, include: { variants: true } });
    if (!product) throw httpError(404, NOT_FOUND_MESSAGE);

    const ctx = await loadValidationContext(tx);
    const input = normalizeProductInput({ ...mapProductColumns(product), is_active: isActive, variants: product.variants.map(mapVariant) });
    const errors = validateProduct(input, { ...ctx, productId: String(product.productId) });
    if (Object.keys(errors).length) throw validationError(errors);

    await tx.product.update({ where: { productId: product.productId }, data: { isActive } });
    return { product_id: String(product.productId), is_active: isActive };
  });
}

module.exports = {
  NOT_FOUND_MESSAGE,
  mapProductColumns,
  mapVariant,
  loadValidationContext,
  getAdminProducts,
  getAdminProduct,
  setProductActive,
};
