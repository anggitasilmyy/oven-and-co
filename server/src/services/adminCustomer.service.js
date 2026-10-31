// services/adminCustomer.service.js
// Step 6.4.8 · FR-35 · UC-25 · AD-10 tab "Pelanggan" (Staf & Owner). Kontrak = client services/adminCustomerService.js
// getAdminCustomers (mock buildAdminCustomerRows): array { user_id, name, email, phone, is_active, total_orders,
// total_spend, level, last_order_at }. Hanya pengguna ber-role customer; kata sandi/google_id tidak pernah dikirim.
// Pencarian nama/email/HP dilakukan di client (filterCustomers), sama dengan mock.
// Agregat dihitung MySQL (groupBy) — tanpa memuat semua pesanan. Semua query lewat `tx` berurutan dalam satu snapshot
// baca REPEATABLE READ (readSnapshot.service.js), jadi total pesanan, total belanja, level, dan pesanan terakhir satu
// pelanggan berasal dari waktu yang sama walau ada checkout/pelunasan/pembatalan bersamaan.

const { ORDER_STATUS, PAYMENT_STATUS, POINT_TX_TYPE, ROLES } = require('../utils/businessConstants');
const { getJakartaDayRange } = require('../utils/jakartaDate');
const { getJakartaYear, getYearlyEarnedPoints } = require('./loyaltyRules.service');
const { toCustomerRow, sortCustomerRows } = require('./adminCustomerRules.service');
const { runInReadSnapshot } = require('./readSnapshot.service');

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const cents = (value) => Math.round(Number(value ?? 0) * 100);

/** Map user_id → agregat, digabung dari beberapa groupBy */
function mergeAggregates(groups) {
  const byUser = new Map();
  const entry = (userId) => {
    const key = String(userId);
    if (!byUser.has(key)) byUser.set(key, {});
    return byUser.get(key);
  };
  for (const g of groups.counted) entry(g.userId).totalOrders = g._count._all;
  for (const g of groups.spend) entry(g.userId).spendCents = cents(g._sum.total);
  for (const g of groups.last) entry(g.userId).lastOrderAt = g._max.createdAt;
  for (const [userId, txs] of groups.points) entry(userId).yearlyPoints = getYearlyEarnedPoints(txs, groups.year);
  return byUser;
}

async function readCustomerRows(tx, now) {
  const settings = await tx.storeSetting.findFirst({
    orderBy: { settingId: 'asc' },
    select: { goldMinPoints: true, platinumMinPoints: true },
  });
  if (!settings) throw httpError(500, 'Pengaturan toko belum tersedia.');

  const customers = await tx.user.findMany({
    where: { role: ROLES.CUSTOMER },
    orderBy: { userId: 'asc' },
    select: { userId: true, name: true, email: true, phone: true, isActive: true },
  });
  const counted = await tx.order.groupBy({
    by: ['userId'], where: { orderStatus: { not: ORDER_STATUS.DIBATALKAN } }, _count: { _all: true },
  });
  const spend = await tx.order.groupBy({
    by: ['userId'], where: { paymentStatus: PAYMENT_STATUS.PAID, orderStatus: { not: ORDER_STATUS.DIBATALKAN } }, _sum: { total: true },
  });
  const last = await tx.order.groupBy({ by: ['userId'], _max: { createdAt: true } });

  // Periode level = tahun kalender berjalan WIB (TF-11); hanya poin yang diperoleh (earn & review_bonus, positif)
  const year = getJakartaYear(now);
  const pointRows = await tx.pointTransaction.findMany({
    where: {
      type: { in: [POINT_TX_TYPE.EARN, POINT_TX_TYPE.REVIEW_BONUS] },
      points: { gt: 0 },
      createdAt: getJakartaDayRange(`${year}-01-01`, `${year}-12-31`),
    },
    select: { userId: true, type: true, points: true, createdAt: true },
  });
  const points = new Map();
  for (const row of pointRows) {
    const key = String(row.userId);
    points.set(key, [...(points.get(key) ?? []), row]);
  }

  const aggregates = mergeAggregates({ counted, spend, last, points, year });
  const levelSettings = { gold_min_points: settings.goldMinPoints, platinum_min_points: settings.platinumMinPoints };
  return sortCustomerRows(customers.map((u) => toCustomerRow(
    { user_id: String(u.userId), name: u.name, email: u.email, phone: u.phone, is_active: u.isActive },
    aggregates.get(String(u.userId)),
    levelSettings,
  )));
}

/** GET /api/admin/customers */
function getAdminCustomers(now = new Date()) {
  return runInReadSnapshot((tx) => readCustomerRows(tx, now));
}

module.exports = {
  getAdminCustomers,
};
