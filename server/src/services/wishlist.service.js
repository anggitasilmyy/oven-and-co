// services/wishlist.service.js
// FR-25 · UC-17 · C-23 — wishlist pelanggan login (tabel wishlists, PK komposit user_id + product_id).
// Bentuk respons mengikuti client services/wishlistService.js: id produk BIGINT sebagai string,
// daftar produk memakai product view yang sama dengan kartu katalog.
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { productCardInclude, getProductRatings, toProductView } = require('./productView.service');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Baris wishlist milik pelanggan, terakhir disimpan dulu */
function findOwnRows(userId) {
  return prisma.wishlist.findMany({
    where: { userId: BigInt(userId) },
    orderBy: [{ createdAt: 'desc' }, { productId: 'desc' }],
    select: { productId: true },
  });
}

/** GET /api/me/wishlist — product_id (string) di wishlist pelanggan */
async function getWishlistIds(userId) {
  const rows = await findOwnRows(userId);
  return rows.map((row) => String(row.productId));
}

/** GET /api/me/wishlist/products — produk aktif di wishlist (produk nonaktif tidak ditampilkan) */
async function getWishlistProducts(userId, now = new Date()) {
  const rows = await findOwnRows(userId);

  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { productId: { in: rows.map((row) => row.productId) }, isActive: true },
    include: productCardInclude(dateKeyToDbDate(getJakartaDateKey(now))),
  });

  const byId = new Map(products.map((product) => [String(product.productId), product]));
  // Urutan mengikuti waktu disimpan, bukan urutan hasil query produk
  const ordered = rows.map((row) => byId.get(String(row.productId))).filter(Boolean);
  const ratings = await getProductRatings(ordered.map((product) => product.productId));

  return ordered.map((product) => toProductView(product, ratings));
}

/** POST /api/me/wishlist/:productId — idempoten; hanya produk aktif */
async function addToWishlist(userId, productId) {
  const product = await prisma.product.findFirst({
    where: { productId: BigInt(productId), isActive: true },
    select: { productId: true },
  });

  if (!product) {
    throw httpError(404, 'Produk tidak ditemukan.');
  }

  const key = { userId: BigInt(userId), productId: BigInt(productId) };

  try {
    // Sudah ada → tidak diubah (created_at tetap waktu pertama disimpan)
    await prisma.wishlist.upsert({
      where: { userId_productId: key },
      create: key,
      update: {},
    });
  } catch (error) {
    // Dua request bersamaan: baris sudah dibuat request lain → hasil tetap tersimpan
    if (error.code !== 'P2002') throw error;
  }

  return { product_id: String(productId), wishlisted: true };
}

/** DELETE /api/me/wishlist/:productId — idempoten; produk nonaktif tetap boleh dihapus */
async function removeFromWishlist(userId, productId) {
  await prisma.wishlist.deleteMany({
    where: { userId: BigInt(userId), productId: BigInt(productId) },
  });

  return { product_id: String(productId), wishlisted: false };
}

module.exports = {
  getWishlistIds,
  getWishlistProducts,
  addToWishlist,
  removeFromWishlist,
};
