
const express = require('express');
const customOptionsService = require('../../services/customOptions.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// GET /api/custom-options
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const builder =
      await customOptionsService.getCustomCakeBuilder();

    return res.status(200).json({
      status: 'success',
      data: builder,
    });
  })
);

module.exports = router;
