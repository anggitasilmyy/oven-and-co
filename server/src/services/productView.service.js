// services/productView.service.js
// FR-05 · FR-06 · FR-08 · FR-09 — bentuk data produk siap tampil (sama dengan client services/mock/productViews.js
// dan services/mock/reviewViews.js): snake_case, id BIGINT sebagai string, rating dari ulasan yang tidak disembunyikan.

const prisma = require('../lib/prisma');
const { ORDER_STATUS, PAYMENT_STATUS, AVAILABILITY_TYPE } = require('../utils/businessConstants');
const { getJakartaDayRange } = require('../utils/jakartaDate');

/** Relasi yang dibutuhkan kartu produk (kategori, foto utama, stok hari ini) */
function productCardInclude(stockDate) {
  return {
    category: { select: { categoryId: true, name: true } },
    images: {
      orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }],
      take: 1,
      select: { imageUrl: true },
    },
    dailyStocks: {
      where: { stockDate },
      select: { qtyPlanned: true, qtySold: true },
    },
  };
}

function getRemainingToday(product) {
  const stock = product.dailyStocks?.[0] ?? null;
  return stock ? Math.max(0, stock.qtyPlanned - stock.qtySold) : 0;
}

/** Rata-rata 1 desimal; average null bila belum ada ulasan (sama dengan utils/rules/rating.js) */
function averageOf(ratings) {
  if (ratings.length === 0) return { average: null, count: 0 };

  const sum = ratings.reduce((total, rating) => total + rating, 0);

  return {
    average: Math.round((sum / ratings.length) * 10) / 10,
    count: ratings.length,
  };
}

/** Map product_id → {average, count} dari ulasan yang tidak disembunyikan */
async function getProductRatings(productIds) {
  const ratings = new Map();

  if (productIds.length === 0) return ratings;

  const reviews = await prisma.review.findMany({
    where: {
      isHidden: false,
      orderItem: { is: { productId: { in: productIds } } },
    },
    select: {
      rating: true,
      orderItem: { select: { productId: true } },
    },
  });

  const grouped = new Map();

  for (const review of reviews) {
    const key = String(review.orderItem.productId);
    grouped.set(key, [...(grouped.get(key) ?? []), review.rating]);
  }

  for (const [key, values] of grouped) {
    ratings.set(key, averageOf(values));
  }

  return ratings;
}

/**
 * Jumlah terjual per produk dari pesanan lunas & tidak dibatalkan yang dibuat pada rentang tanggal WIB
 * (sama dengan utils/rules/sales.js isSalesOrder + getBestSellerTotals).
 * @returns {Promise<Map<string, number>>}
 */
async function getSalesTotals(startKey, endKey) {
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: PAYMENT_STATUS.PAID,
      orderStatus: { not: ORDER_STATUS.DIBATALKAN },
      createdAt: getJakartaDayRange(startKey, endKey),
    },
    select: {
      items: { select: { productId: true, quantity: true } },
    },
  });

  const totals = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      const key = String(item.productId);
      totals.set(key, (totals.get(key) ?? 0) + item.quantity);
    }
  }

  return totals;
}

/** Produk + nama kategori, foto utama, rating, dan sisa stok hari ini (khusus ready) */
function toProductView(product, ratings) {
  const isReady = product.availabilityType === AVAILABILITY_TYPE.READY;

  return {
    product_id: String(product.productId),
    name: product.name,
    price: Number(product.price),
    category_id: product.categoryId,
    category_name: product.category?.name ?? '',
    availability_type: product.availabilityType,
    lead_time_days: product.leadTimeDays,
    is_active: product.isActive,
    image_url: product.images?.[0]?.imageUrl ?? null,
    rating: ratings.get(String(product.productId)) ?? { average: null, count: 0 },
    remaining_today: isReady ? getRemainingToday(product) : null,
  };
}

/** "Rina Wulandari" → "Rina W." (nama pengulas disingkat) */
function displayName(fullName = '') {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first || 'Pelanggan';
}

/** Ulasan tampil (tidak disembunyikan) milik satu produk, terbaru dulu */
async function getProductReviewViews(productId) {
  const reviews = await prisma.review.findMany({
    where: {
      isHidden: false,
      orderItem: { is: { productId } },
    },
    orderBy: [{ createdAt: 'desc' }, { reviewId: 'desc' }],
    include: {
      user: { select: { name: true } },
      photos: { orderBy: { photoId: 'asc' }, select: { photoUrl: true } },
      orderItem: { select: { variant: { select: { name: true } } } },
    },
  });

  return reviews.map((review) => ({
    review_id: String(review.reviewId),
    reviewer_name: displayName(review.user?.name),
    rating: review.rating,
    tags: review.tags ? review.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    comment: review.comment,
    variant_name: review.orderItem?.variant?.name ?? null,
    photos: review.photos.map((photo) => photo.photoUrl),
    admin_reply: review.adminReply,
    is_hidden: false,
    created_at: review.createdAt.toISOString(),
  }));
}

/** Ringkasan rating C-10 (sama dengan utils/rules/rating.js summarizeRatings) */
function summarizeRatings(reviews) {
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((review) => review.rating === stars).length;

    return {
      stars,
      count,
      percent: reviews.length ? Math.round((count / reviews.length) * 100) : 0,
    };
  });

  return {
    ...averageOf(reviews.map((review) => review.rating)),
    distribution,
    withPhotoCount: reviews.filter((review) => review.photos.length > 0).length,
  };
}

module.exports = {
  productCardInclude,
  getRemainingToday,
  getProductRatings,
  getSalesTotals,
  toProductView,
  getProductReviewViews,
  summarizeRatings,
};
