// routes/customer/me.routes.js
// FR-25 · UC-17 · C-23 — data milik pelanggan login (/api/me/*). Step 6.3: wishlist, poin, voucher, alamat, profil.
// FR-05 · FR-22 · BR-09 — GET /api/me/points (MemberCard di Beranda, Akun, Voucher & Poin).
// FR-22 · FR-23 · C-21 — GET /api/me/points/history dan GET /api/me/vouchers (halaman Voucher & Poin).
// FR-24 · BR-12 · C-22 — /api/me/addresses (Alamat Tersimpan).
// FR-24 · UC-16 · C-20 — /api/me/profile & /api/me/password (Ubah Profil).
// FR-18 · UC-18 · C-24 — /api/me/notifications (Notifikasi; baca & tandai dibaca).
// Pengguna selalu dari req.user (token), tidak pernah dari body/URL.

const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const wishlistService = require('../../services/wishlist.service');
const loyaltyService = require('../../services/loyalty.service');
const myVoucherService = require('../../services/myVoucher.service');
const addressService = require('../../services/address.service');
const profileService = require('../../services/profile.service');
const notificationService = require('../../services/notification.service');
const { validateProductIdParam } = require('../../validators/wishlist.validator');
const { validateAddressIdParam, validateAddressBody } = require('../../validators/address.validator');
const { validateProfileBody, validatePasswordBody } = require('../../validators/profile.validator');
const { validateNotificationIdParam } = require('../../validators/notification.validator');
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

// GET /api/me/profile
// Profil pelanggan login (bentuk sama dengan user sesi hasil login), tanpa kata sandi.
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await profileService.getMyProfile(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: profile,
    });
  })
);

// PATCH /api/me/profile (dipakai client services/accountService.js) · PUT /api/me/profile (alias)
// Mengubah nama, email, dan nomor HP; mengembalikan profil terbaru.
const updateProfile = asyncHandler(async (req, res) => {
  const input = validateProfileBody(req.body);
  const profile = await profileService.updateMyProfile(req.user.userId, input);

  return res.status(200).json({
    status: 'success',
    data: profile,
  });
});
router.patch('/profile', updateProfile);
router.put('/profile', updateProfile);

// PATCH /api/me/password (dipakai client services/accountService.js) · PUT /api/me/password (alias)
// Mengganti kata sandi setelah kata sandi saat ini diverifikasi.
const changePassword = asyncHandler(async (req, res) => {
  const input = validatePasswordBody(req.body);
  const result = await profileService.changeMyPassword(req.user.userId, input);

  return res.status(200).json({
    status: 'success',
    data: result,
  });
});
router.patch('/password', changePassword);
router.put('/password', changePassword);

// GET /api/me/addresses
// Alamat pelanggan (utama dulu) + jarak & status radius pengiriman, beserta data toko.
router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    const result = await addressService.getMyAddresses(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// POST /api/me/addresses
// Menambah alamat; alamat pertama otomatis menjadi alamat utama.
router.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const input = validateAddressBody(req.body);
    const result = await addressService.createAddress(req.user.userId, input);

    return res.status(201).json({
      status: 'success',
      data: result,
    });
  })
);

// PUT /api/me/addresses/:addressId
// Mengubah alamat milik pelanggan.
router.put(
  '/addresses/:addressId',
  asyncHandler(async (req, res) => {
    const addressId = validateAddressIdParam(req.params.addressId);
    const input = validateAddressBody(req.body);
    const result = await addressService.updateAddress(req.user.userId, addressId, input);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// PATCH /api/me/addresses/:addressId/primary
// Menjadikan alamat sebagai alamat utama.
router.patch(
  '/addresses/:addressId/primary',
  asyncHandler(async (req, res) => {
    const addressId = validateAddressIdParam(req.params.addressId);
    const result = await addressService.setPrimaryAddress(req.user.userId, addressId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// DELETE /api/me/addresses/:addressId
// Menghapus alamat (ditolak bila sudah dipakai pesanan).
router.delete(
  '/addresses/:addressId',
  asyncHandler(async (req, res) => {
    const addressId = validateAddressIdParam(req.params.addressId);
    const result = await addressService.deleteAddress(req.user.userId, addressId);

    return res.status(200).json({
      status: 'success',
      data: result,
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

// GET /api/me/notifications
// Notifikasi pelanggan login, terbaru dulu, beserta jumlah belum dibaca dan today_key (WIB).
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const result = await notificationService.getMyNotifications(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// GET /api/me/notifications/unread-count
// Jumlah notifikasi belum dibaca (angka).
router.get(
  '/notifications/unread-count',
  asyncHandler(async (req, res) => {
    const count = await notificationService.getUnreadCount(req.user.userId);

    return res.status(200).json({
      status: 'success',
      data: count,
    });
  })
);

// PATCH /api/me/notifications/:notificationId/read
// Menandai satu notifikasi milik pelanggan login sebagai dibaca (idempoten).
router.patch(
  '/notifications/:notificationId/read',
  asyncHandler(async (req, res) => {
    const notificationId = validateNotificationIdParam(req.params.notificationId);
    const result = await notificationService.markAsRead(req.user.userId, notificationId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
