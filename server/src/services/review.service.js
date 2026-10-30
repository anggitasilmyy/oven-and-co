// services/review.service.js
// FR-09 · FR-21 · BR-11 · C-10 Ulasan Produk · C-19 Form Ulasan — port server dari client/src/services/reviewService.js
// dan services/mock/reviewWrites.js dengan aturan & pesan yang sama.
// - Ulasan hanya untuk item pesanan Selesai milik pelanggan; satu ulasan per item (reviews.order_item_id UNIQUE).
// - Bonus = store_settings.review_bonus_points, dicatat `review_bonus` dengan review_id, dalam transaksi yang sama.
// - Foto: file multipart divalidasi di route, ditulis ke disk DI LUAR transaksi (pola custom cake) dan dihapus lagi
//   bila penyimpanan database gagal. Ulasan disembunyikan (is_hidden) tidak pernah tampil di halaman pelanggan.

const prisma = require('../lib/prisma');
const { POINT_TX_TYPE, API_ERROR_CODE } = require('../utils/businessConstants');
const { saveReviewPhoto, deleteReviewPhoto } = require('../utils/reviewPhotoStorage');
const { getProductReviewViews, summarizeRatings } = require('./productView.service');
const { canReviewOrder } = require('./orderTracking.service');
const { toItemLine, findMyOrderDetailRow } = require('./myOrders.service');

const MESSAGES = Object.freeze({
  NOT_COMPLETED: 'Ulasan hanya bisa diberikan untuk pesanan Selesai',
  ITEM_NOT_IN_ORDER: 'Produk tidak ada di pesanan ini',
  ALREADY_REVIEWED: 'Produk ini sudah kamu ulas',
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

async function getReviewBonusPoints(client) {
  const settings = await client.storeSetting.findFirst({
    orderBy: { settingId: 'asc' },
    select: { reviewBonusPoints: true },
  });
  if (!settings) throw httpError(500, 'Pengaturan toko belum tersedia.');
  return settings.reviewBonusPoints;
}

/** GET /api/orders/:orderNumber/reviews — item pesanan beserta status sudah/belum diulas (C-19) */
async function getOrderReviewForm(userId, orderNumber, now = new Date()) {
  const [row, bonusPoints] = await Promise.all([
    findMyOrderDetailRow(prisma, userId, orderNumber, now),
    getReviewBonusPoints(prisma),
  ]);

  return {
    order_number: row.orderNumber,
    can_review: canReviewOrder({ order_status: row.orderStatus }),
    bonus_points: bonusPoints,
    items: row.items.map(toItemLine).map((line) => ({
      order_item_id: line.order_item_id,
      product_id: line.product_id,
      name: line.name,
      image_url: line.image_url,
      variant_name: line.variant_name,
      design: line.design,
      reviewed: line.reviewed,
    })),
  };
}

/** Pemeriksaan sebelum file ditulis: pesanan milik pelanggan, Selesai, item bagian dari pesanan, belum diulas */
async function assertReviewable(userId, orderNumber, orderItemId) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId: BigInt(userId) },
    select: {
      orderStatus: true,
      items: { select: { orderItemId: true, review: { select: { reviewId: true } } } },
    },
  });

  if (!order) throw httpError(404, 'Pesanan tidak ditemukan.');
  if (!canReviewOrder({ order_status: order.orderStatus })) throw httpError(409, MESSAGES.NOT_COMPLETED);

  const item = order.items.find((entry) => String(entry.orderItemId) === orderItemId);
  if (!item) throw httpError(400, MESSAGES.ITEM_NOT_IN_ORDER);
  if (item.review) throw httpError(409, MESSAGES.ALREADY_REVIEWED);
}

async function removePhotos(urls) {
  // Kegagalan pembersihan hanya dicatat; error utama tetap yang dikirim ke pemanggil (pola custom cake)
  await Promise.all(urls.map((url) => deleteReviewPhoto(url).catch((cleanupError) => {
    console.warn('[Upload] Gagal menghapus foto ulasan yatim:', url, cleanupError.code ?? cleanupError.message);
  })));
}

/**
 * POST /api/orders/:orderNumber/reviews
 * @param {string} userId — dari req.user
 * @param {{order_item_id: string, rating: number, tags: string[], comment: string|null}} input — review.validator
 * @param {Array<{buffer: Buffer, extension: string}>} photos — hasil validateReviewPhoto (maks. 3)
 * @returns {Promise<{review_id: string, points: number}>}
 */
async function createReview(userId, orderNumber, input, photos = [], now = new Date()) {
  const owner = BigInt(userId);
  await assertReviewable(userId, orderNumber, input.order_item_id);

  const savedUrls = [];
  try {
    for (const photo of photos) savedUrls.push(await saveReviewPhoto(photo));

    return await prisma.$transaction(async (tx) => {
      const points = await getReviewBonusPoints(tx);
      // UNIQUE(order_item_id): request ganda/bersamaan untuk item yang sama gagal di sini (P2002) → tanpa bonus kedua
      const review = await tx.review.create({
        data: {
          userId: owner,
          orderItemId: BigInt(input.order_item_id),
          rating: input.rating,
          tags: input.tags.length ? input.tags.join(', ') : null,
          comment: input.comment,
          isHidden: false,
          createdAt: now,
        },
        select: { reviewId: true },
      });

      if (savedUrls.length) {
        await tx.reviewPhoto.createMany({
          data: savedUrls.map((photoUrl) => ({ reviewId: review.reviewId, photoUrl })),
        });
      }
      // BR-11: bonus dicatat SETELAH ulasan tersimpan, dalam transaksi yang sama
      await tx.pointTransaction.create({
        data: { userId: owner, type: POINT_TX_TYPE.REVIEW_BONUS, points, reviewId: review.reviewId, createdAt: now },
      });

      return { review_id: String(review.reviewId), points };
    });
  } catch (error) {
    await removePhotos(savedUrls);
    if (error.code === 'P2002') throw httpError(409, MESSAGES.ALREADY_REVIEWED);
    throw error;
  }
}

/**
 * GET /api/products/:productId/reviews — publik (C-10). Produk tidak ada/nonaktif → null (kontrak mock).
 * Ulasan & ringkasan memakai productView.service yang sama dengan Detail Produk (is_hidden tidak dihitung).
 */
async function getProductReviews(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    // Sama dengan GET /api/products/:id: frontend memperlakukan INVALID_ID seperti "tidak ditemukan"
    throw Object.assign(httpError(400, 'ID produk tidak valid.'), { apiCode: API_ERROR_CODE.INVALID_ID });
  }

  const productId = BigInt(id);
  const product = await prisma.product.findFirst({
    where: { productId, isActive: true },
    select: { productId: true, name: true },
  });
  if (!product) return null;

  const reviews = await getProductReviewViews(productId);

  return {
    product: { product_id: String(product.productId), name: product.name },
    summary: summarizeRatings(reviews),
    reviews,
  };
}

module.exports = {
  MESSAGES,
  getOrderReviewForm,
  createReview,
  getProductReviews,
};
