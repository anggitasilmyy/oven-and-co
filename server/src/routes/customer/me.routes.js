// routes/customer/me.routes.js
// FR-25 · UC-17 · C-23 — data milik pelanggan login (/api/me/*). Step 6.3: wishlist, poin, dan voucher.
// FR-05 · FR-22 · BR-09 — GET /api/me/points (MemberCard di Beranda, Akun, Voucher & Poin).
// FR-22 · FR-23 · C-21 — GET /api/me/points/history dan GET /api/me/vouchers (halaman Voucher & Poin).
// Pengguna selalu dari req.user (token), tidak pernah dari body/URL.

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const wishlistService = require('../../services/wishlist.service');
const loyaltyService = require('../../services/loyalty.service');
const myVoucherService = require('../../services/myVoucher.service');
const { validateProductIdParam } = require('../../validators/wishlist.validator');
const { ROLES } = require('../../utils/businessConstants');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Seluruh endpoint /api/me hanya untuk pelanggan yang sudah login.
router.use(auth, requireRole(ROLES.CUSTOMER));

// GET /api/me/points
// Ringkasan poin & level member pelanggan login.
router.get(
  '/points',
  asyncHandler(async (req, res) => {
    const summary = await loyaltyService.getMyLoyaltySummary(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: summary,
    });
  })
);

// GET /api/me/points/history
// Riwayat transaksi poin pelanggan login, terbaru dulu.
router.get(
  '/points/history',
  asyncHandler(async (req, res) => {
    const history = await loyaltyService.getMyPointHistory(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: history,
    });
  })
);

// GET /api/me/vouchers
// Voucher yang sudah diklaim pelanggan login beserta statusnya.
router.get(
  '/vouchers',
  asyncHandler(async (req, res) => {
    const vouchers = await myVoucherService.getMyVouchers(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: vouchers,
    });
  })
);

// GET /api/me/wishlist
// Mengambil product_id (string) di wishlist pelanggan.
router.get(
  '/wishlist',
  asyncHandler(async (req, res) => {
    const productIds = await wishlistService.getWishlistIds(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: productIds,
    });
  })
);

// GET /api/me/wishlist/products
// Mengambil kartu produk aktif di wishlist, terakhir disimpan dulu.
router.get(
  '/wishlist/products',
  asyncHandler(async (req, res) => {
    const products = await wishlistService.getWishlistProducts(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: products,
    });
  })
);

// POST /api/me/wishlist/:productId
// Menyimpan produk aktif ke wishlist (idempoten).
router.post(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    const productId = validateProductIdParam(req.params.productId);
    const result = await wishlistService.addToWishlist(req.user.userId, productId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// DELETE /api/me/wishlist/:productId
// Menghapus produk dari wishlist (idempoten).
router.delete(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    const productId = validateProductIdParam(req.params.productId);
    const result = await wishlistService.removeFromWishlist(req.user.userId, productId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
