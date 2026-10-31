// routes/admin/calendar.routes.js
// Step 6.4.3 · FR-29 · UC-22 · AD-05 — GET /api/admin/calendar?month=YYYY-MM&date=YYYY-MM-DD (Staf & Owner).
// Kontrak = client services/adminOrderService.js getProductionCalendar (mock productionViews.js).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const productionCalendarService = require('../../services/productionCalendar.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/calendar → { month_key, today_key, weeks, counts, selected: { date, groups } }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const calendar = await productionCalendarService.getProductionCalendar(req.query);

    return res.status(200).json({ status: 'success', data: calendar });
  })
);

module.exports = router;
