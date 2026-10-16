// utils/rules/loyalty.js
// Poin & level member (dipindah dari businessRules.js di Step 5.1 tanpa mengubah perilaku)
// FR-22 · BR-09 · TF-11

import { STORE_SETTINGS_DEFAULT, MEMBER_LEVEL } from '../../constants/storeConfig';

/** Saldo poin = Σ point_transactions.points (tidak disimpan sebagai kolom) */
export function getPointBalance(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.points, 0);
}

/** Poin yang diperoleh (earn + review_bonus) pada tahun kalender tertentu */
export function getYearlyEarnedPoints(transactions, year) {
  return transactions
    .filter((tx) => tx.points > 0 && (tx.type === 'earn' || tx.type === 'review_bonus'))
    .filter((tx) => new Date(tx.created_at).getFullYear() === year)
    .reduce((sum, tx) => sum + tx.points, 0);
}

/**
 * Level member dari poin tahunan: Silver < 500, Gold 500–1.999, Platinum ≥ 2.000.
 * @returns {{level, nextLevel, pointsToNext}}
 */
export function getMemberLevel(yearlyPoints, settings = STORE_SETTINGS_DEFAULT) {
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

/** Poin yang diperoleh dari total pesanan Selesai: 1 poin per Rp 1.000 */
export function pointsEarnedFor(total, settings = STORE_SETTINGS_DEFAULT) {
  return Math.floor(total / settings.earn_amount_per_point);
}

/** Nilai rupiah saldo poin bila ditukar (100 poin = Rp 5.000) */
export function pointsRedeemValue(points, settings = STORE_SETTINGS_DEFAULT) {
  return Math.floor(points / settings.redeem_points_unit) * settings.redeem_value;
}
