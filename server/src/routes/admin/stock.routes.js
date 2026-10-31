// routes/admin/stock.routes.js
// Step 6.4 · FR-32 · UC-24 · AD-07 tab "Stok Produk Harian" (Staf & Owner). Kontrak = client services/stockService.js
// (getDailyStocks, updateDailyStocks).

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const adminDailyStockService = require('../../services/adminDailyStock.service');
const { validateDailyPlansBody } = require('../../validators/adminCatalog.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('staf', 'owner'));

// GET /api/admin/stocks/today → { date, rows }
router.get(
  '/today',
  asyncHandler(async (req, res) => {
    res.status(200).json({ status: 'success', data: await adminDailyStockService.getDailyStockBoard() });
  })
);

// PUT /api/admin/stocks/today { plans: [{ product_id, qty_planned }] } → { date, rows }
router.put(
  '/today',
  asyncHandler(async (req, res) => {
    const { plans } = validateDailyPlansBody(req.body);
    res.status(200).json({ status: 'success', data: await adminDailyStockService.saveDailyStockPlans(plans) });
  })
);

module.exports = router;
