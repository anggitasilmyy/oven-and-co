// services/adminDashboard.service.js
// Step 6.4.6 · FR-27 · UC-26 · AD-02 Dashboard (Owner). Kontrak = client services/dashboardService.js getOwnerDashboard:
// { todayKey, kpi{revenueToday, revenueChange, ordersToday, needsProcessing, rating{average,count}}, salesChart,
//   statusCounts, totalOrders, recentOrders, bestSellers, lowStock }.
// Definisi angka sama dengan mock (dan AD-03 / Beranda), "hari ini" = WIB:
//   - omzet & grafik: pesanan lunas & tidak dibatalkan per tanggal dibuat (salesRules.service.js); 8 hari diambil agar
//     omzet kemarin tersedia sebagai pembanding hari pertama grafik 7 hari;
//   - pesanan hari ini: semua pesanan yang dibuat hari ini (semua status, termasuk dibatalkan — sama dengan mock);
//   - perlu diproses & donut: jumlah per status dari satu groupBy;
//   - rating: ulasan yang tidak disembunyikan (FR-35), rata-rata 1 desimal dari SUM/COUNT (tanpa galat AVG);
//   - produk terlaris: aturan server GET /api/products/best-sellers (produk nonaktif dikecualikan — keputusan 6.4.6;
//     mock masih ikut menghitung produk nonaktif);
//   - stok menipis: bahan baku dengan stock ≤ min_stock (FR-32). Traceability BR-018 menyebut daily_stocks, tetapi
//     daily_stocks tidak punya batas minimum — keputusan 6.4.6 mengikuti mock & AD-07 (lihat ROADMAP).
// Konsistensi: SEMUA query (termasuk relasi include & produk terlaris) berjalan berurutan dalam satu snapshot baca
// REPEATABLE READ (readSnapshot.service.js) lewat klien transaksi `tx` — tidak ada yang memakai Prisma global — dan
// satu nilai `now`, sehingga angka antarbagian dalam satu respons tidak saling bertentangan. Tanpa kunci baris.

const {
  ORDER_STATUS, PAYMENT_STATUS, SALES_WINDOW_DAYS, BEST_SELLER_LIMIT, RECENT_ORDERS_LIMIT,
} = require('../utils/businessConstants');
const { getJakartaDateKey, getJakartaDayRange } = require('../utils/jakartaDate');
const {
  lastNDateKeys, aggregateDailySales, percentChange, countOrdersByStatus, countNeedsProcessing, isLowStock,
} = require('./salesRules.service');
const { ADMIN_ORDER_ROW_INCLUDE, toAdminOrderRow } = require('./adminOrder.service');
const { getBestSellers } = require('./product.service');
const { runInReadSnapshot } = require('./readSnapshot.service');

/** Pesanan penjualan (lunas & tidak dibatalkan) yang dibuat pada rentang tanggal WIB */
async function getSalesOrders(tx, startKey, endKey) {
  const rows = await tx.order.findMany({
    where: {
      paymentStatus: PAYMENT_STATUS.PAID,
      orderStatus: { not: ORDER_STATUS.DIBATALKAN },
      createdAt: getJakartaDayRange(startKey, endKey),
    },
    select: { createdAt: true, total: true, paymentStatus: true, orderStatus: true },
  });
  return rows.map((o) => ({
    created_at: o.createdAt, total: Number(o.total), payment_status: o.paymentStatus, order_status: o.orderStatus,
  }));
}

/** Rata-rata rating ulasan yang tidak disembunyikan (sama dengan client rules/rating.js averageRating) */
async function getAverageRating(tx) {
  const result = await tx.review.aggregate({
    where: { isHidden: false },
    _sum: { rating: true },
    _count: { _all: true },
  });
  const count = result._count._all;
  if (count === 0) return { average: null, count: 0 };
  return { average: Math.round((Number(result._sum.rating) / count) * 10) / 10, count };
}

/** Bahan baku dengan stok ≤ minimum, urut id (bentuk client LowStockPanel) */
async function getLowStockMaterials(tx) {
  const rows = await tx.rawMaterial.findMany({ orderBy: { materialId: 'asc' } });
  return rows
    .map((m) => ({ material_id: String(m.materialId), name: m.name, unit: m.unit, stock: Number(m.stock), min_stock: Number(m.minStock) }))
    .filter(isLowStock);
}

/** Semua bagian Dashboard dari satu snapshot (`tx`), berurutan */
async function readDashboard(tx, now) {
  const todayKey = getJakartaDateKey(now);
  // 8 hari: hari pertama hanya pembanding omzet kemarin
  const salesKeys = lastNDateKeys(todayKey, SALES_WINDOW_DAYS + 1);

  const salesOrders = await getSalesOrders(tx, salesKeys[0], todayKey);
  const ordersToday = await tx.order.count({ where: { createdAt: getJakartaDayRange(todayKey) } });
  const statusGroups = await tx.order.groupBy({ by: ['orderStatus'], _count: { _all: true } });
  const rating = await getAverageRating(tx);
  const recentOrders = await tx.order.findMany({
    orderBy: [{ createdAt: 'desc' }, { orderId: 'desc' }],
    take: RECENT_ORDERS_LIMIT,
    include: ADMIN_ORDER_ROW_INCLUDE,
  });
  const bestSellers = await getBestSellers({ limit: String(BEST_SELLER_LIMIT) }, now, tx);
  const lowStock = await getLowStockMaterials(tx);

  const sales = aggregateDailySales(salesOrders, salesKeys);
  const [yesterday, today] = sales.slice(-2);
  const statusCounts = countOrdersByStatus(statusGroups.map((g) => ({ status: g.orderStatus, count: g._count._all })));

  return {
    todayKey,
    kpi: {
      revenueToday: today.revenue,
      revenueChange: percentChange(today.revenue, yesterday.revenue),
      ordersToday,
      needsProcessing: countNeedsProcessing(statusCounts),
      rating,
    },
    salesChart: sales.slice(1),
    statusCounts,
    totalOrders: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    recentOrders: recentOrders.map(toAdminOrderRow),
    bestSellers,
    lowStock,
  };
}

/** GET /api/admin/dashboard */
function getOwnerDashboard(now = new Date()) {
  return runInReadSnapshot((tx) => readDashboard(tx, now));
}

module.exports = {
  getOwnerDashboard,
};
