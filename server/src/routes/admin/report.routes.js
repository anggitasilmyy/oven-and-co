// routes/admin/report.routes.js
// Step 6.4.7 · FR-33 · UC-27 · UC-28 · AD-08 Laporan Penjualan — hanya Owner (SPEC §2: "laporan & ekspor").
// Kontrak = client services/reportService.js getSalesReport. Ekspor Excel/PDF dibuat di peramban dari respons ini.

const express = require('express');

const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const salesReportService = require('../../services/salesReport.service');
const operationsReportService = require('../../services/operationsReport.service');
const { validateReportQuery } = require('../../validators/adminReport.validator');

const router = express.Router();

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(auth, requireRole('owner'));

// GET /api/admin/reports/sales?period=harian|mingguan|bulanan|rentang&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const filter = validateReportQuery(req.query);
    res.status(200).json({ status: 'success', data: await salesReportService.getSalesReport(filter) });
  })
);

// CR-04c · FR-47 · AD-08 tab Operasional (Owner, K18) — periode sama dengan /sales (K16); hanya membaca
// GET /api/admin/reports/operations?period=harian|mingguan|bulanan|rentang&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/operations',
  asyncHandler(async (req, res) => {
    const filter = validateReportQuery(req.query);
    res.status(200).json({ status: 'success', data: await operationsReportService.getOperationsReport(filter) });
  })
);

module.exports = router;
