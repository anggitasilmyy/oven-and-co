// pages/admin/LaporanPage.jsx
// FR-33 · UC-27 · UC-28 · A-08 · AD-08 Laporan Penjualan (Owner)
// Step 5.8: filter periode (Harian/Mingguan/Bulanan/Rentang, disimpan di URL), KPI, grafik per hari, produk terlaris,
// metode pembayaran, tabel transaksi, Export Excel/PDF. Hanya transaksi lunas yang tidak dibatalkan (FR-33).

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import DashboardPanel from '../../components/admin/DashboardPanel';
import ReportPeriodFilter from '../../components/admin/ReportPeriodFilter';
import ReportKpis from '../../components/admin/ReportKpis';
import DailySalesBarChart from '../../components/admin/DailySalesBarChart';
import BestSellersPanel from '../../components/admin/BestSellersPanel';
import PaymentMethodDonut from '../../components/admin/PaymentMethodDonut';
import ReportTransactionsTable from '../../components/admin/ReportTransactionsTable';
import ReportExportButtons from '../../components/admin/ReportExportButtons';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getSalesReport } from '../../services/reportService';
import { REPORT_PERIOD } from '../../constants/report';
import { formatReportPeriod } from '../../utils/reportExport';
import { toDateKey } from '../../utils/date';

/** Filter dari URL; periode default Mingguan (asumsi prototype, sama dengan rentang grafik Dashboard) */
function readFilter(params) {
  const period = Object.values(REPORT_PERIOD).includes(params.get('periode')) ? params.get('periode') : REPORT_PERIOD.MINGGUAN;
  return period === REPORT_PERIOD.RENTANG
    ? { period, from: params.get('dari') ?? '', to: params.get('sampai') ?? '' }
    : { period };
}

export default function LaporanPage() {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params);
  const report = useServiceQuery(() => getSalesReport(filter), [filter]);
  const { toast, showToast, hideToast } = useToast();
  const data = report.data;
  // Cadangan "hari ini" sebelum laporan pertama termuat (validasi rentang di filter); server tetap memvalidasi ulang
  const [fallbackToday] = useState(() => toDateKey(new Date()));

  const changeFilter = (next) => setParams(
    next.period === REPORT_PERIOD.RENTANG ? { periode: next.period, dari: next.from, sampai: next.to } : { periode: next.period },
    { replace: true },
  );

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-08"
        title="Laporan Penjualan"
        description={data ? `Periode ${formatReportPeriod(data.from, data.to)} · transaksi lunas` : 'Omzet, transaksi, produk terlaris, dan metode pembayaran'}
        actions={<ReportExportButtons report={report.loading ? null : data} storeName={data?.store_name ?? ''} onToast={showToast} />}
      />

      <ReportPeriodFilter value={{ ...filter, from: filter.from ?? data?.from, to: filter.to ?? data?.to }} todayKey={data?.todayKey ?? fallbackToday} onChange={changeFilter} />

      {report.error && <ErrorState message={report.error.message || 'Laporan gagal dimuat.'} onRetry={report.reload} />}
      {!data && !report.error && (
        <div className="space-y-6" aria-busy="true" aria-label="Memuat laporan">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="block" className="h-28 w-full" />)}</div>
          <Skeleton variant="block" className="h-80 w-full" />
        </div>
      )}

      {data && (
        <div className={`space-y-6 transition-opacity ${report.loading ? 'opacity-60' : ''}`} aria-busy={report.loading}>
          <ReportKpis kpi={data.kpi} />
          <DashboardPanel title="Penjualan per Hari" description="Omzet transaksi lunas per tanggal pesan">
            <DailySalesBarChart data={data.daily} />
          </DashboardPanel>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <DashboardPanel title="Produk Terlaris" description="Jumlah terjual pada periode ini">
              <BestSellersPanel
                products={data.bestSellers.map((b) => ({ ...b, quantity_sold: b.quantity, image_url: null }))}
                emptyText="Belum ada penjualan pada periode ini."
              />
            </DashboardPanel>
            <DashboardPanel title="Metode Pembayaran" description="Jumlah transaksi & omzet per metode">
              <PaymentMethodDonut methods={data.paymentMethods} />
            </DashboardPanel>
          </div>
          <DashboardPanel title="Transaksi" description="Pesanan lunas yang tidak dibatalkan, terbaru dulu">
            <ReportTransactionsTable key={`${data.from}_${data.to}`} rows={data.transactions} />
          </DashboardPanel>
        </div>
      )}
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
