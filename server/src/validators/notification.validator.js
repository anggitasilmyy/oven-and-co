// validators/notification.validator.js
// FR-18 · UC-18 · C-24 — validasi parameter :notificationId pada /api/me/notifications/:notificationId/read dengan zod.
// Id tidak valid → 400 dengan kode INVALID_ID (frontend memperlakukannya seperti "tidak ditemukan").

const { API_ERROR_CODE } = require('../utils/businessConstants');
const { parseOrThrow, bigIntIdString } = require('./zodHelpers');

const notificationIdParam = bigIntIdString('ID notifikasi tidak valid.');

/** @returns {string} notificationId sebagai string digit BIGINT positif */
function validateNotificationIdParam(value) {
  try {
    return parseOrThrow(notificationIdParam, value);
  } catch (error) {
    throw Object.assign(error, { apiCode: API_ERROR_CODE.INVALID_ID });
  }
}

module.exports = {
  validateNotificationIdParam,
};
