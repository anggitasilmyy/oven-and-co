// routes/admin/dashboard.routes.js
// Step 6.4.6 · FR-27 · UC-26 · AD-02 Dashboard — hanya Owner (SPEC §2: Staf tidak punya akses dashboard).
// Kontrak = client services/dashboardService.js getOwnerDashboard. Endpoint tanpa input (tidak ada query/body),
// jadi tidak ada skema zod; tanggal "hari ini" selalu dari jam server (WIB).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminDashboardService = require('../../services/adminDashboard.service');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('owner'));

// GET /api/admin/dashboard → { todayKey, kpi, salesChart, statusCounts, totalOrders, recentOrders, bestSellers, lowStock }
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminDashboardService.getOwnerDashboard() });
  })
);

module.exports = router;
