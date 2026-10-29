// validators/wishlist.validator.js
// FR-25 · UC-17 · C-23 — validasi parameter :productId pada /api/me/wishlist/:productId dengan zod.
// Id tidak valid → 400 dengan kode INVALID_ID (frontend memperlakukannya seperti "tidak ditemukan").

const { API_ERROR_CODE } = require('../utils/businessConstants');
const { parseOrThrow, bigIntIdString } = require('./zodHelpers');

const productIdParam = bigIntIdString('ID produk tidak valid.');

/** @returns {string} productId sebagai string digit BIGINT positif */
function validateProductIdParam(value) {
  try {
    return parseOrThrow(productIdParam, value);
  } catch (error) {
    throw Object.assign(error, { apiCode: API_ERROR_CODE.INVALID_ID });
  }
}

module.exports = {
  validateProductIdParam,
};
