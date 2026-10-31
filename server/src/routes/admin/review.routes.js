// routes/admin/review.routes.js
// Step 6.4.8 · FR-35 · UC-25 · BR-11 · AD-10 tab "Ulasan" — Staf & Owner (SPEC §2). Kontrak = client
// services/adminCustomerService.js (getAdminReviews, replyReview, setReviewHidden).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminReviewService = require('../../services/adminReview.service');
const {
  validateReviewQuery, validateReviewId, validateReplyBody, validateHiddenBody,
} = require('../../validators/adminCustomer.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/reviews?rating=semua|1..5 → { rows, summary{ total, hidden, unreplied } }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rating } = validateReviewQuery(req.query);
    res.status(200).json({ status: 'success', data: await adminReviewService.getAdminReviews(rating) });
  })
);

// PUT /api/admin/reviews/:id/reply { admin_reply } → baris ulasan admin
router.put(
  '/:id/reply',
  asyncHandler(async (req, res) => {
    const reviewId = validateReviewId(req.params.id);
    const { admin_reply: reply } = validateReplyBody(req.body);
    res.status(200).json({ status: 'success', data: await adminReviewService.replyReview(reviewId, reply) });
  })
);

// PATCH /api/admin/reviews/:id/hidden { is_hidden } → baris ulasan admin
router.patch(
  '/:id/hidden',
  asyncHandler(async (req, res) => {
    const reviewId = validateReviewId(req.params.id);
    const { is_hidden: isHidden } = validateHiddenBody(req.body);
    res.status(200).json({ status: 'success', data: await adminReviewService.setReviewHidden(reviewId, isHidden) });
  })
);

module.exports = router;
