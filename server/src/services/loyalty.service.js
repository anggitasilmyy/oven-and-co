// services/loyalty.service.js
// FR-05 · FR-22 · BR-09 · TF-11 — ringkasan poin & level pelanggan login (GET /api/me/points).
// Bentuk respons mengikuti client services/loyaltyService.js getMyLoyaltySummary (dipakai MemberCard).
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const {
  getPointBalance, getJakartaYear, getYearlyEarnedPoints, getMemberLevel, pointsRedeemValue,
} = require('./loyaltyRules.service');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Kolom store_settings untuk aturan loyalty (Decimal → number) */
function mapLoyaltySettings(row) {
  return {
    earn_amount_per_point: Number(row.earnAmountPerPoint),
    redeem_points_unit: row.redeemPointsUnit,
    redeem_value: Number(row.redeemValue),
    gold_min_points: row.goldMinPoints,
    platinum_min_points: row.platinumMinPoints,
  };
}

/**
 * GET /api/me/points — saldo, nilai tukar, poin tahun ini, dan level member.
 * Pelanggan tanpa transaksi → saldo 0, level Silver.
 */
async function getMyLoyaltySummary(userId, now = new Date()) {
  const [storeRow, transactions] = await Promise.all([
    prisma.storeSetting.findFirst({
      orderBy: { settingId: 'asc' },
      select: {
        earnAmountPerPoint: true,
        redeemPointsUnit: true,
        redeemValue: true,
        goldMinPoints: true,
        platinumMinPoints: true,
      },
    }),
    prisma.pointTransaction.findMany({
      where: { userId: BigInt(userId) },
      select: { type: true, points: true, createdAt: true },
    }),
  ]);

  if (!storeRow) {
    throw httpError(500, 'Pengaturan toko belum tersedia.');
  }

  const settings = mapLoyaltySettings(storeRow);
  const balance = getPointBalance(transactions);
  // Periode level = tahun kalender berjalan zona Asia/Jakarta (asumsi TF-11)
  const yearlyPoints = getYearlyEarnedPoints(transactions, getJakartaYear(now));

  return {
    balance,
    redeemValue: pointsRedeemValue(balance, settings),
    yearlyPoints,
    ...getMemberLevel(yearlyPoints, settings),
    // Aturan loyalty (AD-09) untuk keterangan level di C-21
    settings: {
      earn_amount_per_point: settings.earn_amount_per_point,
      gold_min_points: settings.gold_min_points,
      platinum_min_points: settings.platinum_min_points,
    },
  };
}

module.exports = {
  getMyLoyaltySummary,
};
