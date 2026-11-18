// pages/admin/LaporanPage.jsx
// FR-33 · UC-27 · UC-28 · A-08 · AD-08 Laporan (Owner) — tab Penjualan (default, Step 5.8: filter periode di URL, KPI,
// grafik per hari, produk terlaris, metode pembayaran, tabel transaksi, Export Excel/PDF; hanya transaksi lunas yang tidak
// dibatalkan) dan tab Operasional (CR-04c · FR-47 · UC-38 · K15 – K19, `?tab=operasional`): pembelian, penerimaan, mutasi,
// pemakaian standar/aktual/selisih, hasil produksi, rencana vs hasil, omzet pembanding, analisis FR-40. Periode sama.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Tabs from '../../components/ui/Tabs';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import ReportPeriodFilter from '../../components/admin/ReportPeriodFilter';
import ReportExportButtons from '../../components/admin/ReportExportButtons';
import SalesReportBody from '../../components/admin/SalesReportBody';
import OperationsReportBody from '../../components/admin/OperationsReportBody';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getSalesReport, getOperationsReport } from '../../services/reportService';
import { REPORT_PERIOD, REPORT_TAB, REPORT_TABS } from '../../constants/report';
import { formatReportPeriod } from '../../utils/reportExport';
import { exportOperationsExcel, exportOperationsPdf } from '../../utils/operationsExport';
import { toDateKey } from '../../utils/date';

/** Filter dari URL; periode default Mingguan (asumsi prototype, sama dengan rentang grafik Dashboard) */
function readFilter(params) {
  const period = Object.values(REPORT_PERIOD).includes(params.get('periode')) ? params.get('periode') : REPORT_PERIOD.MINGGUAN;
  return period === REPORT_PERIOD.RENTANG
    ? { period, from: params.get('dari') ?? '', to: params.get('sampai') ?? '' }
    : { period };
}

const OPERATIONS_EXPORTERS = { excel: exportOperationsExcel, pdf: exportOperationsPdf };

export default function LaporanPage() {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params);
  const isOps = params.get('tab') === REPORT_TAB.OPERASIONAL;
  // Hanya laporan tab aktif yang dimuat (tab Penjualan & /reports/sales tidak berubah)
  const report = useServiceQuery(() => (isOps ? getOperationsReport(filter) : getSalesReport(filter)), [filter, isOps]);
  const { toast, showToast, hideToast } = useToast();
  const data = report.data && (isOps ? 'purchases' in report.data : 'kpi' in report.data) ? report.data : null;
  // Cadangan "hari ini" sebelum laporan pertama termuat (validasi rentang di filter); server tetap memvalidasi ulang
  const [fallbackToday] = useState(() => toDateKey(new Date()));

  const toParams = (next, tab) => ({
    ...(next.period === REPORT_PERIOD.RENTANG ? { periode: next.period, dari: next.from, sampai: next.to } : { periode: next.period }),
    ...(tab === REPORT_TAB.OPERASIONAL ? { tab } : {}),
  });
  const changeFilter = (next) => setParams(toParams(next, isOps ? REPORT_TAB.OPERASIONAL : REPORT_TAB.PENJUALAN), { replace: true });
  const changeTab = (tab) => setParams(toParams(filter, tab), { replace: true });
  const period = data ? `Periode ${formatReportPeriod(data.from, data.to)}` : null;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-08"
        title={isOps ? 'Laporan Operasional' : 'Laporan Penjualan'}
        description={isOps
          ? (period ? `${period} · pembelian, persediaan, dan produksi` : 'Pembelian, penerimaan, mutasi stok, pemakaian bahan, dan hasil produksi')
          : (period ? `${period} · transaksi lunas` : 'Omzet, transaksi, produk terlaris, dan metode pembayaran')}
        actions={(
          <ReportExportButtons report={report.loading ? null : data} storeName={data?.store_name ?? ''} onToast={showToast}
            {...(isOps ? { exporters: OPERATIONS_EXPORTERS } : {})} />
        )}
      />

      <Tabs tabs={REPORT_TABS} value={isOps ? REPORT_TAB.OPERASIONAL : REPORT_TAB.PENJUALAN} onChange={changeTab} label="Jenis laporan" />

      <div role="tabpanel" id={`panel-${isOps ? REPORT_TAB.OPERASIONAL : REPORT_TAB.PENJUALAN}`} aria-labelledby={`tab-${isOps ? REPORT_TAB.OPERASIONAL : REPORT_TAB.PENJUALAN}`} className="space-y-5 md:space-y-6">
        <ReportPeriodFilter value={{ ...filter, from: filter.from ?? data?.from, to: filter.to ?? data?.to }} todayKey={data?.todayKey ?? fallbackToday} onChange={changeFilter} />

        {report.error && <ErrorState message={report.error.message || 'Laporan gagal dimuat.'} onRetry={report.reload} />}
        {!data && !report.error && (
          <div className="space-y-6" aria-busy="true" aria-label="Memuat laporan">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="block" className="h-28 w-full" />)}</div>
            <Skeleton variant="block" className="h-80 w-full" />
          </div>
        )}
        {isOps ? <OperationsReportBody data={data} loading={report.loading} /> : <SalesReportBody data={data} loading={report.loading} />}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
