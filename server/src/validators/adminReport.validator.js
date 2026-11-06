// validators/adminReport.validator.js
// Step 6.4.7 · FR-33 · AD-08 — query GET /api/admin/reports/sales (client services/reportService.js getSalesReport:
// `?period=…` dan `from`/`to` hanya untuk periode rentang). Bentuk dicek di sini; aturan rentang (urutan, hari ini,
// maks. hari) di services/reportRules.service.js dengan pesan yang sama dengan mock.
// Berbeda dari mock: periode tidak dikenal → 400 (mock diam-diam memakai mingguan). Tanpa periode → mingguan
// (default halaman AD-08). from/to diabaikan untuk periode selain rentang (sama dengan mock).

const { z, parseOrThrow } = require('./zodHelpers');
const { REPORT_PERIOD } = require('../utils/businessConstants');

const DATE_PARAM_MAX = 10; // "YYYY-MM-DD"

const dateParam = z
  .string({ error: 'Pilih tanggal mulai dan tanggal selesai' })
  .max(DATE_PARAM_MAX, { error: 'Pilih tanggal mulai dan tanggal selesai' })
  .optional();

const reportQuerySchema = z.object({
  period: z
    .enum(Object.values(REPORT_PERIOD), { error: 'Periode laporan tidak valid.' })
    .default(REPORT_PERIOD.MINGGUAN),
  from: dateParam,
  to: dateParam,
});

/** @returns {{period: string, from?: string, to?: string}} parameter lain diabaikan */
function validateReportQuery(query) {
  return parseOrThrow(reportQuerySchema, query ?? {});
}

module.exports = {
  validateReportQuery,
};
