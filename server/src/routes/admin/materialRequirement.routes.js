// routes/admin/materialRequirement.routes.js
// CR-03 CP5 · FR-40 · UC-32 · AD-07 tab Kebutuhan Bahan — estimasi kebutuhan bahan (Staf & Owner; pelanggan 403,
// tanpa token 401). Kontrak = CR-03 §B7.3: 400 tanggal tidak valid / di luar rentang; 500 MILLI_PRECISION_LOST.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { getMaterialRequirements } = require('../../services/materialRequirement.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/material-requirements?date=YYYY-MM-DD → { date, today_key, window, cumulative_range, rows, summary, … }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await getMaterialRequirements(req.query) });
  })
);

module.exports = router;
