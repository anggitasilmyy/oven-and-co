// services/promo.service.js
// FR-05 · C-05 Beranda — banner promo dari voucher aktif (SPEC §8 vouchers).
// Bentuk sama dengan mock client services/promoService.js getActivePromos:
// {voucher_id, code, title, discount_type, discount_value, valid_to, product_id, product_name, image_url}.
// Aturan aktif memakai isVoucherActiveOn yang sama dengan checkout (is_active, kuota tersisa, dalam periode WIB).

const prisma = require('../lib/prisma');
const { getJakartaDateKey, dateKeyToDbDate, dbDateToKey } = require('../utils/jakartaDate');
const { isVoucherActiveOn } = require('./checkoutRules.service');

function mapPromo(row) {
  return {
    voucher_id: String(row.voucherId),
    code: row.code,
    title: row.title,
    discount_type: row.discountType,
    discount_value: Number(row.discountValue),
    valid_to: dbDateToKey(row.validTo),
    product_id: row.productId == null ? null : String(row.productId),
    product_name: row.product?.name ?? null,
    image_url: row.product?.images?.[0]?.imageUrl ?? null,
  };
}

/** Promo aktif hari ini (WIB), urut voucher_id seperti tabel mock */
async function getActivePromos(now = new Date()) {
  const todayKey = getJakartaDateKey(now);

  // Query hanya memangkas voucher nonaktif & yang sudah berakhir; keputusan akhir tetap di isVoucherActiveOn
  const rows = await prisma.voucher.findMany({
    where: {
      isActive: true,
      validTo: { gte: dateKeyToDbDate(todayKey) },
    },
    orderBy: { voucherId: 'asc' },
    include: {
      product: {
        select: {
          name: true,
          images: {
            orderBy: [{ sortOrder: 'asc' }, { imageId: 'asc' }],
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
    },
  });

  return rows
    .filter((row) =>
      isVoucherActiveOn(
        {
          is_active: row.isActive,
          quota: row.quota,
          valid_from: dbDateToKey(row.validFrom),
          valid_to: dbDateToKey(row.validTo),
        },
        todayKey
      )
    )
    .map(mapPromo);
}

module.exports = {
  getActivePromos,
};
