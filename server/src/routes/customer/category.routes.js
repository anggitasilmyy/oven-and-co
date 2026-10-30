
const express = require('express');
const categoryService = require('../../services/category.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/categories
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await categoryService.getCategories();

    return res.status(200).json({
      status: 'success',
      data: categories,
    });
  })
);

module.exports = router;
