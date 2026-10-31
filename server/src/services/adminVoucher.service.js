// services/adminVoucher.service.js
// Step 6.4.9 · FR-34 · UC-29 · BR-10 · AD-09 tab "Voucher" (Owner). Kontrak = client services/adminPromoService.js
// (mock promoAdmin.js): getAdminVouchers → { todayKey, rows (+product_name, used, status), products },
// saveVoucher (POST/PUT) & setVoucherActive → baris voucher (bentuk checkout.service.js mapVoucher). Voucher tidak dihapus
// (dirujuk pesanan & user_vouchers), hanya dinonaktifkan. Voucher dipakai checkout/C-21/banner tanpa perubahan kode 6.3.
//
// Konsistensi kuota (vouchers.quota = sisa pemakaian, diubah checkout `quota - 1` & pembatalan `quota + 1` secara atomik):
//   - PUT mengunci baris voucher (SELECT … FOR UPDATE) sebagai PEMBACAAN PERTAMA transaksi, lalu menulis kuota hanya bila
//     berubah dan `expected_quota` cocok dengan kuota terkunci (adminPromoRules.service.js resolveQuotaUpdate) — 400 bila
//     expected tidak dikirim, 409 bila basi. Edit informasi lain tidak pernah menimpa kuota. Checkout/pembatalan yang
//     datang bersamaan menunggu kunci ini (UPDATE baris yang sama), sehingga tidak ada update yang hilang.
//   - Urutan kunci: transaksi voucher hanya mengunci baris voucher, checkout mengunci users → store_settings → … →
//     vouchers — tidak ada urutan silang, jadi tidak membentuk deadlock.
//   - Kode unik dijaga UNIQUE(vouchers.code): pengecekan memberi pesan mock; dua request bersamaan dengan kode sama →
//     yang kalah mendapat P2002 → 400 fieldErrors.code yang sama.
// Daftar memakai satu snapshot baca REPEATABLE READ (voucher, jumlah terpakai, produk konsisten).

const prisma = require('../lib/prisma');
const { ORDER_STATUS } = require('../utils/businessConstants');
const { getJakartaDateKey, dateKeyToDbDate } = require('../utils/jakartaDate');
const { mapVoucher } = require('./checkout.service');
const {
  normalizeVoucherInput, validateVoucher, resolveQuotaUpdate, getAdminVoucherStatus, isBigIntIdString,
} = require('./adminPromoRules.service');
const { runInReadSnapshot } = require('./readSnapshot.service');

const NOT_FOUND_MESSAGE = 'Voucher tidak ditemukan';
const CODE_TAKEN = 'Kode voucher sudah dipakai';

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode }, fieldErrors ? { fieldErrors } : {});
}

/** GET /api/admin/vouchers */
function getAdminVoucherBoard(now = new Date()) {
  const todayKey = getJakartaDateKey(now);
  return runInReadSnapshot(async (tx) => {
    const vouchers = await tx.voucher.findMany({ include: { product: { select: { name: true } } } });
    const usage = await tx.order.groupBy({
      by: ['voucherId'],
      where: { voucherId: { not: null }, orderStatus: { not: ORDER_STATUS.DIBATALKAN } },
      _count: { _all: true },
    });
    const products = await tx.product.findMany({ select: { productId: true, name: true, isActive: true } });

    const used = new Map(usage.map((g) => [String(g.voucherId), g._count._all]));
    const rows = vouchers
      .map((row) => {
        const v = mapVoucher(row);
        return {
          ...v,
          product_name: v.product_id == null ? null : row.product?.name ?? `Produk #${v.product_id}`,
          used: used.get(v.voucher_id) ?? 0,
          status: getAdminVoucherStatus(v, todayKey),
        };
      })
      .sort((a, b) => b.valid_to.localeCompare(a.valid_to) || a.code.localeCompare(b.code));
    return {
      todayKey,
      rows,
      products: products
        .map((p) => ({ product_id: String(p.productId), name: p.name, is_active: p.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/** Kunci baris voucher (pembacaan pertama transaksi) → kuota terkunci; tidak ada → 404 */
async function lockVoucher(tx, voucherId) {
  const rows = await tx.$queryRaw`SELECT voucher_id, quota FROM vouchers WHERE voucher_id = ${BigInt(voucherId)} FOR UPDATE`;
  if (rows.length === 0) throw httpError(404, NOT_FOUND_MESSAGE);
  return Number(rows[0].quota);
}

const toData = (v) => ({
  code: v.code,
  title: v.title,
  discountType: v.discount_type,
  discountValue: v.discount_value,
  productId: v.product_id == null ? null : BigInt(v.product_id),
  validFrom: dateKeyToDbDate(v.valid_from),
  validTo: dateKeyToDbDate(v.valid_to),
  isActive: v.is_active,
});

/**
 * POST /api/admin/vouchers (voucherId null) atau PUT /api/admin/vouchers/:id.
 * @param {object} input — body tervalidasi bentuknya (validators/adminPromo.validator.js)
 */
async function saveVoucher(voucherId, input) {
  const v = normalizeVoucherInput(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const lockedQuota = voucherId == null ? null : await lockVoucher(tx, voucherId);

      const sameCode = v.code ? await tx.voucher.findUnique({ where: { code: v.code }, select: { voucherId: true } }) : null;
      const codeTaken = Boolean(sameCode) && String(sameCode.voucherId) !== String(voucherId);
      // ID di luar format/batas BIGINT tidak pernah dikirim ke basis data (→ 400 fieldErrors.product_id)
      const productExists = v.product_id != null && isBigIntIdString(v.product_id)
        && Boolean(await tx.product.findUnique({ where: { productId: BigInt(v.product_id) }, select: { productId: true } }));
      const errors = validateVoucher(v, { codeTaken, productExists });
      if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);

      if (voucherId == null) {
        const created = await tx.voucher.create({ data: { ...toData(v), quota: v.quota } });
        return mapVoucher(created);
      }
      const quota = resolveQuotaUpdate(v.quota, input.expected_quota, lockedQuota);
      const updated = await tx.voucher.update({
        where: { voucherId: BigInt(voucherId) },
        data: { ...toData(v), ...(quota == null ? {} : { quota }) },
      });
      return mapVoucher(updated);
    });
  } catch (error) {
    if (error.code === 'P2002') throw httpError(400, CODE_TAKEN, { code: CODE_TAKEN });
    throw error;
  }
}

/** PATCH /api/admin/vouchers/:id/active — kuota & field lain tidak tersentuh */
function setVoucherActive(voucherId, isActive) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.voucher.updateMany({ where: { voucherId: BigInt(voucherId) }, data: { isActive } });
    if (count === 0) throw httpError(404, NOT_FOUND_MESSAGE);
    return mapVoucher(await tx.voucher.findUnique({ where: { voucherId: BigInt(voucherId) } }));
  });
}

module.exports = {
  getAdminVoucherBoard,
  saveVoucher,
  setVoucherActive,
};
