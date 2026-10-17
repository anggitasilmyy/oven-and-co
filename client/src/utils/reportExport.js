// utils/reportExport.js
// Step 5.8 · FR-33 · UC-28 · AD-08 — ekspor laporan penjualan ke Excel (.xlsx) & PDF di peramban.
// Library (ROADMAP 5.8 mengizinkan): write-excel-file (xlsx, MIT, 1 dependensi) dan jspdf + jspdf-autotable (PDF).
// Keduanya dimuat dinamis (import()) hanya saat tombol ekspor diklik agar bundle halaman lain tidak membesar.
// buildReportExportTables adalah fungsi murni: isi file sama dengan data laporan di layar.

import { formatRupiah, formatDateFull, formatNumber, formatDateShort, formatTime } from './format';
import { parseDateKey } from './date';
import { FULFILLMENT_LABEL } from '../constants/orderStatus';
import { REPORT_FILE_PREFIX } from '../constants/report';

/** Sel bernilai rupiah: angka di Excel (format "Rp #.##0"), teks "Rp 28.000" di PDF */
const rupiah = (value) => ({ rupiah: value });

/** "Jumat, 16 Oktober 2026" atau "10 Okt 2026 – 16 Okt 2026" */
export function formatReportPeriod(from, to) {
  if (from === to) return formatDateFull(parseDateKey(from));
  const short = (k) => parseDateKey(k).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${short(from)} – ${short(to)}`;
}

/** Nama file: laporan-penjualan-oven-and-co_2026-10-10_2026-10-16 */
export const reportFileName = (report) => `${REPORT_FILE_PREFIX}_${report.from}_${report.to}`;

/**
 * Tabel ekspor dari data laporan: ringkasan KPI, per hari, produk terlaris, metode bayar, transaksi.
 * @returns {Array<{title, head: string[], rows: Array<Array<string|number|{rupiah:number}>>}>}
 */
export function buildReportExportTables(report) {
  return [
    {
      title: 'Ringkasan',
      head: ['Indikator', 'Nilai'],
      rows: [
        ['Omzet', rupiah(report.kpi.revenue)],
        ['Jumlah Transaksi', report.kpi.transactions],
        ['Rata-rata per Transaksi', rupiah(report.kpi.average)],
        ['Produk Terjual', report.kpi.itemsSold],
      ],
    },
    {
      title: 'Penjualan per Hari',
      head: ['Tanggal', 'Transaksi', 'Omzet'],
      rows: report.daily.map((d) => [formatDateShort(parseDateKey(d.date)), d.orders, rupiah(d.revenue)]),
    },
    {
      title: 'Produk Terlaris',
      head: ['Peringkat', 'Produk', 'Terjual (pcs)'],
      rows: report.bestSellers.map((b, i) => [i + 1, b.name, b.quantity]),
    },
    {
      title: 'Metode Pembayaran',
      head: ['Metode', 'Transaksi', 'Omzet'],
      rows: report.paymentMethods.map((m) => [m.name, m.transactions, rupiah(m.revenue)]),
    },
    {
      title: 'Transaksi',
      head: ['No. Pesanan', 'Tanggal', 'Pelanggan', 'Pengambilan', 'Metode Bayar', 'Item', 'Total'],
      rows: report.transactions.map((r) => [
        r.order_number, `${formatDateShort(r.created_at)}, ${formatTime(r.created_at)}`, r.customer_name,
        FULFILLMENT_LABEL[r.fulfillment_type], r.method_name, r.item_count, rupiah(r.total),
      ]),
    },
  ];
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Excel: satu sheet per tabel; sheet Ringkasan diawali judul & periode */
export async function exportReportExcel(report, storeName) {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const bold = (value) => ({ value, fontWeight: 'bold' });
  const cell = (v) => (v && typeof v === 'object' ? { value: v.rupiah, type: Number, format: '"Rp "#,##0' } : { value: v });
  const sheets = buildReportExportTables(report).map((table, i) => ({
    sheet: table.title,
    columns: table.head.map((h, c) => ({ width: c === 0 ? 24 : Math.max(14, h.length + 4) })),
    data: [
      ...(i === 0 ? [[bold(`Laporan Penjualan ${storeName}`)], [{ value: `Periode: ${formatReportPeriod(report.from, report.to)}` }], []] : []),
      table.head.map(bold),
      ...table.rows.map((row) => row.map(cell)),
    ],
  }));
  download(await writeXlsxFile(sheets).toBlob(), `${reportFileName(report)}.xlsx`);
}

/** PDF A4: judul & periode, lalu setiap tabel diberi judul (pindah halaman bila sisa ruang tidak cukup) */
export async function exportReportPdf(report, storeName) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const cocoa = [92, 61, 46];
  const left = 40;
  const pageBottom = doc.internal.pageSize.getHeight() - 40;
  const text = (v) => (v && typeof v === 'object' ? formatRupiah(v.rupiah) : typeof v === 'number' ? formatNumber(v) : v);

  doc.setTextColor(...cocoa);
  doc.setFontSize(16);
  doc.text(`Laporan Penjualan ${storeName}`, left, 48);
  doc.setFontSize(10);
  doc.text(`Periode: ${formatReportPeriod(report.from, report.to)} · transaksi lunas, tidak dibatalkan`, left, 66);

  let y = 96;
  for (const table of buildReportExportTables(report)) {
    if (y > pageBottom - 80) { doc.addPage(); y = 48; }
    doc.setFontSize(11);
    doc.text(table.title, left, y);
    autoTable(doc, {
      startY: y + 8,
      head: [table.head],
      body: table.rows.length ? table.rows.map((row) => row.map(text)) : [['Belum ada data pada periode ini']],
      margin: { left, right: left, top: 40 },
      styles: { fontSize: 8, textColor: cocoa },
      headStyles: { fillColor: [139, 94, 60], textColor: 255 },
      alternateRowStyles: { fillColor: [251, 246, 238] },
    });
    y = doc.lastAutoTable.finalY + 28;
  }
  download(doc.output('blob'), `${reportFileName(report)}.pdf`);
}
