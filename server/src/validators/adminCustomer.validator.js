// validators/adminCustomer.validator.js
// Step 6.4.8 · FR-35 · AD-10 — input API pelanggan & ulasan admin (client services/adminCustomerService.js).
//   GET /admin/reviews?rating=semua|1..5   PUT /admin/reviews/:id/reply {admin_reply}
//   PATCH /admin/reviews/:id/hidden {is_hidden}
// Pesan balasan sama dengan mock validateAdminReply. Berbeda dari mock (lebih ketat): rating tidak dikenal → 400 (mock
// diam-diam menampilkan semua), is_hidden wajib boolean (mock memakai Boolean()), admin_reply wajib teks.

const { z, parseOrThrow } = require('./zodHelpers');
const { validateIdParam } = require('./adminCatalog.validator');
const { ADMIN_REPLY_MAX, ADMIN_REVIEW_RATING_ALL } = require('../utils/businessConstants');

const RATING_FILTERS = [ADMIN_REVIEW_RATING_ALL, '1', '2', '3', '4', '5'];

const reviewQuerySchema = z.object({
  rating: z.enum(RATING_FILTERS, { error: 'Filter rating tidak valid.' }).default(ADMIN_REVIEW_RATING_ALL),
});

const replySchema = z.object(
  {
    admin_reply: z
      .string({ error: 'Tulis balasan terlebih dahulu' })
      .trim()
      .min(1, { error: 'Tulis balasan terlebih dahulu' })
      .max(ADMIN_REPLY_MAX, { error: `Balasan maksimal ${ADMIN_REPLY_MAX} karakter` }),
  },
  { error: 'Tulis balasan terlebih dahulu' }
);

const hiddenSchema = z.object(
  { is_hidden: z.boolean({ error: 'Status tampil ulasan tidak valid.' }) },
  { error: 'Status tampil ulasan tidak valid.' }
);

module.exports = {
  /** @returns {{rating: string}} parameter lain diabaikan */
  validateReviewQuery: (query) => parseOrThrow(reviewQuerySchema, query ?? {}),
  validateReviewId: (value) => validateIdParam(value, 'ID ulasan tidak valid.'),
  /** @returns {{admin_reply: string}} sudah di-trim */
  validateReplyBody: (body) => parseOrThrow(replySchema, body ?? {}),
  /** @returns {{is_hidden: boolean}} */
  validateHiddenBody: (body) => parseOrThrow(hiddenSchema, body ?? {}),
};
