// utils/operationsExport.js
// CR-04c · FR-47 · K17 · AC-47.4 · AD-08 tab Operasional — tabel ekspor Excel/PDF dari respons laporan yang sama dengan
// layar (isi file = layar). Fungsi murni; penulisan file memakai exportTablesExcel/exportTablesPdf (library AD-08, K17).

import { MOVEMENT_TYPE_LABEL } from '../constants/purchasing';
import { OPERATIONS_FILE_PREFIX } from '../constants/report';
import { formatReportPeriod, exportTablesExcel, exportTablesPdf } from './reportExport';

const rupiah = (value) => ({ rupiah: value });

/** Nama file: laporan-operasional-oven-and-co_2026-11-10_2026-11-16 */
export const operationsFileName = (report) => `${OPERATIONS_FILE_PREFIX}_${report.from}_${report.to}`;

/** @returns {Array<{title, head: string[], rows: Array<Array<string|number|{rupiah:number}>>}>} */
export function buildOperationsExportTables(report) {
  const purchase = (title, section, qtyHead) => ({
    title,
    head: ['Supplier', 'Bahan', 'Satuan', qtyHead, 'Nilai'],
    rows: [...section.rows.map((r) => [r.supplier_name, r.name, r.unit, r.qty, rupiah(r.value)]), ['Total', '', '', '', rupiah(section.total_value)]],
  });
  return [
    {
      title: 'Ringkasan',
      head: ['Indikator', 'Nilai'],
      rows: [
        ['Nilai pembelian dipesan', rupiah(report.purchases.ordered.total_value)],
        ['Nilai penerimaan bersih', rupiah(report.purchases.received.total_value)],
        ['Nilai sisa dibatalkan', rupiah(report.purchases.cancelled.total_value)],
        ['Omzet pembanding (Laporan Penjualan)', rupiah(report.revenue.revenue)],
        ['Transaksi penjualan', report.revenue.transactions],
      ],
    },
    purchase('Pembelian dipesan', report.purchases.ordered, 'Jumlah dipesan'),
    purchase('Penerimaan', report.purchases.received, 'Jumlah bersih'),
    purchase('Sisa dibatalkan', report.purchases.cancelled, 'Jumlah dibatalkan'),
    {
      title: 'Mutasi stok',
      head: ['Bahan', 'Jenis', 'Perubahan', 'Satuan', 'Jumlah mutasi'],
      rows: report.movements.map((m) => [m.name, MOVEMENT_TYPE_LABEL[m.type], m.qty_change, m.unit, m.count]),
    },
    {
      title: 'Pemakaian bahan',
      head: ['Bahan', 'Satuan', 'Standar', 'Aktual', 'Selisih'],
      rows: report.usage.map((u) => [u.name, u.unit, u.standard, u.actual, u.variance]),
    },
    {
      title: 'Hasil produksi',
      head: ['Nomor WO', 'Produk', 'Hasil bersih', 'Keterangan'],
      rows: report.production.map((p) => [p.wo_number, p.product_name, p.net_output, p.corrected ? 'dikoreksi' : '']),
    },
    {
      title: 'Rencana vs hasil',
      head: ['Produk', 'Rencana', 'Hasil'],
      rows: report.plan_vs_output.map((p) => [p.product_name, p.qty_planned, p.net_output]),
    },
  ];
}

const meta = (report, storeName) => ({
  title: `Laporan Operasional ${storeName}`,
  subtitle: `Periode: ${formatReportPeriod(report.from, report.to)}`,
  fileName: operationsFileName(report),
  rupiahDecimals: 2, // AC-47.4: rupiah 2 desimal, sama dengan tampilan tab Operasional
});

export const exportOperationsExcel = (report, storeName) => exportTablesExcel(buildOperationsExportTables(report), meta(report, storeName));
export const exportOperationsPdf = (report, storeName) => exportTablesPdf(buildOperationsExportTables(report), meta(report, storeName));
