// Aturan murni poin & level member (BR-09 · TF-11) — sama dengan client utils/rules/loyalty.js,
// ditambah batas tahun kalender zona Asia/Jakarta.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPointBalance, getJakartaYear, getYearlyEarnedPoints, getMemberLevel, pointsRedeemValue,
} = require('../src/services/loyaltyRules.service');

const settings = {
  earn_amount_per_point: 1000, redeem_points_unit: 100, redeem_value: 5000, gold_min_points: 500, platinum_min_points: 2000,
};

test('saldo = Σ points; tanpa transaksi = 0', () => {
  assert.equal(getPointBalance([]), 0);
  assert.equal(getPointBalance([{ points: 120 }, { points: -100 }, { points: 30 }]), 50);
});

test('tahun level memakai zona Asia/Jakarta (UTC+7)', () => {
  // 31 Des 2025 17.30 UTC = 1 Jan 2026 00.30 WIB
  assert.equal(getJakartaYear(new Date('2025-12-31T17:30:00Z')), 2026);
  assert.equal(getJakartaYear(new Date('2025-12-31T16:59:59Z')), 2025);
});

test('poin tahunan hanya earn & review_bonus positif pada tahun tersebut', () => {
  const transactions = [
    { type: 'earn', points: 300, createdAt: new Date('2025-12-31T17:30:00Z') }, // 2026 WIB
    { type: 'earn', points: 999, createdAt: new Date('2025-12-31T16:00:00Z') }, // 2025 WIB
    { type: 'review_bonus', points: 20, createdAt: new Date('2026-05-01T00:00:00Z') },
    { type: 'redeem', points: -100, createdAt: new Date('2026-05-01T00:00:00Z') },
    { type: 'refund', points: 100, createdAt: new Date('2026-05-01T00:00:00Z') },
  ];
  assert.equal(getYearlyEarnedPoints(transactions, 2026), 320);
  assert.equal(getYearlyEarnedPoints(transactions, 2025), 999);
});

test('batas level: Silver < 500, Gold 500–1.999, Platinum ≥ 2.000', () => {
  assert.deepEqual(
    [0, 499, 500, 1999, 2000].map((points) => [getMemberLevel(points, settings).level.key, getMemberLevel(points, settings).pointsToNext]),
    [['silver', 500], ['silver', 1], ['gold', 1500], ['gold', 1], ['platinum', 0]],
  );
  assert.equal(getMemberLevel(2000, settings).nextLevel, null);
});

test('nilai tukar: kelipatan 100 poin = Rp 5.000', () => {
  assert.equal(pointsRedeemValue(0, settings), 0);
  assert.equal(pointsRedeemValue(99, settings), 0);
  assert.equal(pointsRedeemValue(1250, settings), 60000);
});
