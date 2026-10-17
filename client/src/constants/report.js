// constants/report.js
// FR-33 · UC-27 · UC-28 · AD-08 Laporan Penjualan — periode laporan & batas tampilan
// Periode mengikuti A-08 (harian/mingguan/bulanan) + rentang khusus (UI/UX Spec Batch 7).

/** Kunci periode (disimpan di URL ?periode=) */
export const REPORT_PERIOD = {
  HARIAN: 'harian',
  MINGGUAN: 'mingguan',
  BULANAN: 'bulanan',
  RENTANG: 'rentang',
};

/**
 * Definisi periode (asumsi prototype — dokumen tidak merinci batasnya):
 * Harian = hari ini · Mingguan = 7 hari terakhir (sama dengan grafik Dashboard) · Bulanan = bulan kalender berjalan
 * s.d. hari ini · Rentang = tanggal mulai–selesai pilihan Owner (maks. REPORT_MAX_RANGE_DAYS, tidak melewati hari ini).
 */
export const REPORT_PERIOD_OPTIONS = [
  { key: REPORT_PERIOD.HARIAN, label: 'Harian' },
  { key: REPORT_PERIOD.MINGGUAN, label: 'Mingguan' },
  { key: REPORT_PERIOD.BULANAN, label: 'Bulanan' },
  { key: REPORT_PERIOD.RENTANG, label: 'Rentang' },
];

export const REPORT_WEEK_DAYS = 7;
/** Asumsi prototype: rentang khusus maks. 92 hari (± satu kuartal) agar grafik per hari tetap terbaca */
export const REPORT_MAX_RANGE_DAYS = 92;

/** Jumlah produk terlaris di laporan */
export const REPORT_BEST_SELLER_LIMIT = 5;

/** Baris per halaman tabel transaksi */
export const REPORT_TRANSACTIONS_PAGE_SIZE = 10;

/** Warna donut metode bayar per kelompok (payment_methods.method_group) — palet brand */
export const PAYMENT_GROUP_CHART_COLOR = {
  qris: '#8B5E3C',
  ewallet: '#D9A441',
  va: '#5C3D2E',
  store: '#9DB496',
};

/** Format ekspor (FR-33: Excel/PDF) */
export const REPORT_EXPORT = { EXCEL: 'excel', PDF: 'pdf' };
export const REPORT_FILE_PREFIX = 'laporan-penjualan-oven-and-co';
