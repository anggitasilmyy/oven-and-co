// services/myVoucher.service.js
// FR-23 · BR-10 · C-21 — voucher yang SUDAH DIKLAIM pelanggan login (tabel user_vouchers), bukan semua voucher aktif.
// Bentuk respons mengikuti client services/loyaltyService.js getMyVouchers: { claim, voucher, state, product }.
// Status & urutan sama dengan client utils/rules/account.js (getVoucherState, sortVouchersForDisplay).
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const prisma = require('../lib/prisma');
const { VOUCHER_STATE } = require('../utils/businessConstants');
const { getJakartaDateKey } = require('../utils/jakartaDate');
const { isVoucherActiveOn } = require('./checkoutRules.service');
const { mapVoucher, mapClaim } = require('./checkout.service');

/** Sudah dipakai → used; selain itu aktif pada hari ini (is_active, kuota, periode) → usable, sisanya expired */
function getVoucherState(claim, voucher, todayKey) {
  if (claim.used_at) return VOUCHER_STATE.USED;
  return isVoucherActiveOn(voucher, todayKey) ? VOUCHER_STATE.USABLE : VOUCHER_STATE.EXPIRED;
}

const STATE_RANK = { [VOUCHER_STATE.USABLE]: 0, [VOUCHER_STATE.USED]: 1, [VOUCHER_STATE.EXPIRED]: 2 };

/** Urutan C-21: bisa dipakai → sudah dipakai → tidak berlaku; di dalamnya yang paling cepat berakhir dulu */
function sortVouchersForDisplay(list) {
  return [...list].sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.voucher.valid_to.localeCompare(b.voucher.valid_to)
  );
}

function mapVoucherProduct(row) {
  return row
    ? { product_id: String(row.productId), name: row.name, availability_type: row.availabilityType }
    : null;
}

/** GET /api/me/vouchers — voucher milik pelanggan + status; tanpa klaim → [] */
async function getMyVouchers(userId, now = new Date()) {
  const rows = await prisma.userVoucher.findMany({
    where: { userId: BigInt(userId) },
    include: {
      voucher: {
        include: {
          product: { select: { productId: true, name: true, availabilityType: true } },
        },
      },
    },
    // Urutan dasar yang stabil sebelum diurutkan per status
    orderBy: [{ claimedAt: 'desc' }, { voucherId: 'desc' }],
  });

  const todayKey = getJakartaDateKey(now);

  return sortVouchersForDisplay(
    rows
      .filter((row) => row.voucher)
      .map((row) => {
        const claim = mapClaim(row);
        const voucher = mapVoucher(row.voucher);

        return {
          claim,
          voucher,
          state: getVoucherState(claim, voucher, todayKey),
          product: mapVoucherProduct(row.voucher.product),
        };
      })
  );
}

module.exports = {
  getVoucherState,
  sortVouchersForDisplay,
  getMyVouchers,
};
