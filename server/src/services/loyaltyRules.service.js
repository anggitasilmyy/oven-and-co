// services/loyaltyRules.service.js
// FR-22 · BR-09 · TF-11 — aturan murni poin & level member (sama dengan client utils/rules/loyalty.js).
// settings memakai nama kolom store_settings (snake_case) seperti checkoutRules.service.js.

const { POINT_TX_TYPE, MEMBER_LEVEL } = require('../utils/businessConstants');
const { getJakartaDateKey } = require('../utils/jakartaDate');

const EARNED_TYPES = [POINT_TX_TYPE.EARN, POINT_TX_TYPE.REVIEW_BONUS];

/** Saldo poin = Σ point_transactions.points (tidak disimpan sebagai kolom) */
function getPointBalance(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.points, 0);
}

/** Tahun kalender Asia/Jakarta dari sebuah waktu */
function getJakartaYear(date) {
  return Number(getJakartaDateKey(date).slice(0, 4));
}

/** Poin yang diperoleh (earn + review_bonus) pada tahun kalender Jakarta tertentu */
function getYearlyEarnedPoints(transactions, year) {
  return transactions
    .filter((tx) => tx.points > 0 && EARNED_TYPES.includes(tx.type))
    .filter((tx) => getJakartaYear(tx.createdAt) === year)
    .reduce((sum, tx) => sum + tx.points, 0);
}

/**
 * Level member dari poin tahunan: Silver < gold_min_points, Gold < platinum_min_points, Platinum selebihnya.
 * @returns {{level, nextLevel, pointsToNext}}
 */
function getMemberLevel(yearlyPoints, settings) {
  if (yearlyPoints >= settings.platinum_min_points) {
    return { level: MEMBER_LEVEL.PLATINUM, nextLevel: null, pointsToNext: 0 };
  }
  if (yearlyPoints >= settings.gold_min_points) {
    return {
      level: MEMBER_LEVEL.GOLD,
      nextLevel: MEMBER_LEVEL.PLATINUM,
      pointsToNext: settings.platinum_min_points - yearlyPoints,
    };
  }
  return {
    level: MEMBER_LEVEL.SILVER,
    nextLevel: MEMBER_LEVEL.GOLD,
    pointsToNext: settings.gold_min_points - yearlyPoints,
  };
}

/** Nilai rupiah saldo poin bila ditukar (mis. 100 poin = Rp 5.000) */
function pointsRedeemValue(points, settings) {
  return Math.floor(points / settings.redeem_points_unit) * settings.redeem_value;
}

module.exports = {
  getPointBalance,
  getJakartaYear,
  getYearlyEarnedPoints,
  getMemberLevel,
  pointsRedeemValue,
};
