
// routes/customer/product.routes.js
// FR-05 · FR-06 · FR-07 · FR-08 · C-05 – C-09 — katalog, pencarian, detail produk, Fresh from Oven, Best Sellers
// FR-09 · C-10 — GET /api/products/:id/reviews (ulasan produk, publik)

const express = require('express');
const productService = require('../../services/product.service');
const reviewService = require('../../services/review.service');

const router = express.Router();

// Meneruskan error dari handler async ke errorHandler Express.
function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/products
// Mengambil daftar produk dengan pencarian, filter, dan pagination.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await productService.getProducts(req.query);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

// GET /api/products/fresh-today
// Mengambil produk ready yang masih memiliki stok hari ini.
router.get(
  '/fresh-today',
  asyncHandler(async (req, res) => {
    const products = await productService.getFreshFromOvenToday(
      req.query
    );

    return res.status(200).json({
      status: 'success',
      data: products,
    });
  })
);

// GET /api/products/best-sellers
// Mengambil produk terlaris berdasarkan penjualan tujuh hari terakhir.
router.get(
  '/best-sellers',
  asyncHandler(async (req, res) => {
    const products = await productService.getBestSellers(
      req.query
    );

    return res.status(200).json({
      status: 'success',
      data: products,
    });
  })
);

// GET /api/products/:id
// Mengambil detail satu produk berdasarkan ID.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await productService.getProductById(
      req.params.id
    );

    return res.status(200).json({
      status: 'success',
      data: product,
    });
  })
);

// GET /api/products/:id/reviews
// Ulasan tampil (tidak disembunyikan) + ringkasan rating; produk tidak ada/nonaktif → data null.
router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const result = await reviewService.getProductReviews(req.params.id);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

module.exports = router;
