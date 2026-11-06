// services/adminLoyalty.service.js
// Step 6.4.9 · FR-34 · UC-29 · BR-09 · AD-09 tab "Aturan Loyalty" (Owner). Kontrak = client services/adminPromoService.js
// (mock promoAdmin.js buildLoyaltyRules / saveLoyaltyRules): 5 field store_settings (LOYALTY_FIELDS). Nilai yang disimpan
// langsung dipakai kode 6.3/6.4 yang sudah membaca store_settings: tukar poin checkout (redeem_points_unit/redeem_value),
// poin Selesai AD-04 (earn_amount_per_point), level C-20/C-21/AD-10 (gold/platinum_min_points). Field lain
// store_settings (profil toko AD-11, review_bonus_points) tidak tersentuh.
// Simpan: baris store_settings dikunci (adminMasterDataLock.service.js, pembacaan pertama) lalu di-UPDATE dalam satu
// transaksi — sama dengan transaksi master data admin lain; checkout hanya mengunci baris ini sebentar untuk penomoran.

const prisma = require('../lib/prisma');
const { LOYALTY_FIELDS } = require('../utils/businessConstants');
const { normalizeLoyaltyInput, validateLoyaltyRules } = require('./adminPromoRules.service');
const { lockAdminMasterData } = require('./adminMasterDataLock.service');

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode }, fieldErrors ? { fieldErrors } : {});
}

const COLUMN = Object.freeze({
  earn_amount_per_point: 'earnAmountPerPoint',
  redeem_points_unit: 'redeemPointsUnit',
  redeem_value: 'redeemValue',
  gold_min_points: 'goldMinPoints',
  platinum_min_points: 'platinumMinPoints',
});

const toRules = (row) => Object.fromEntries(LOYALTY_FIELDS.map((f) => [f, Number(row[COLUMN[f]])]));

/** GET /api/admin/loyalty */
async function getLoyaltyRules() {
  const row = await prisma.storeSetting.findFirst({
    orderBy: { settingId: 'asc' },
    select: Object.fromEntries(Object.values(COLUMN).map((c) => [c, true])),
  });
  if (!row) throw httpError(500, 'Pengaturan toko belum tersedia.');
  return toRules(row);
}

/** PUT /api/admin/loyalty — validasi (fieldErrors) lalu simpan 5 field saja */
async function updateLoyaltyRules(input) {
  const rules = normalizeLoyaltyInput(input);
  const errors = validateLoyaltyRules(rules);
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);

  return prisma.$transaction(async (tx) => {
    await lockAdminMasterData(tx);
    await tx.storeSetting.updateMany({ data: Object.fromEntries(LOYALTY_FIELDS.map((f) => [COLUMN[f], rules[f]])) });
    return rules;
  });
}

module.exports = {
  getLoyaltyRules,
  updateLoyaltyRules,
};
