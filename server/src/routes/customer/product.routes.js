
const express = require('express');
const productService = require('../../services/product.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/products
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

// GET /api/products/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await productService.getProductById(
      req.params.id
    );

    return res.status(200).json({
      status: 'success',
      data: {
        product,
      },
    });
  })
);

module.exports = router;
