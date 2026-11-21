// components/admin/OperationsReportBody.jsx
// CR-04c · FR-47 · UC-38 · BR-33 · AD-08 tab Operasional — ringkasan nilai & omzet pembanding (aturan AD-08 apa adanya),
// pembelian, mutasi stok, pemakaian bahan, hasil produksi, rencana vs hasil, analisis FR-40. Semua dari satu respons
// (satu snapshot), sehingga isi ekspor = layar (AC-47.4).

import DashboardPanel from './DashboardPanel';
import OperationsPurchaseTables from './OperationsPurchaseTables';
import OperationsMovementTable from './OperationsMovementTable';
import OperationsUsageTable from './OperationsUsageTable';
import OperationsProductionTables from './OperationsProductionTables';
import OperationsAnalysisPanel from './OperationsAnalysisPanel';
import { formatNumber, formatRupiahExact as formatRupiah } from '../../utils/format'; // AC-47.4: 2 desimal = ekspor

/** @param {{data: object|null, loading: boolean}} props — data = getOperationsReport */
export default function OperationsReportBody({ data, loading }) {
  if (!data) return null;
  const summary = [
    ['Nilai pembelian dipesan', formatRupiah(data.purchases.ordered.total_value)],
    ['Nilai penerimaan bersih', formatRupiah(data.purchases.received.total_value)],
    ['Nilai sisa dibatalkan', formatRupiah(data.purchases.cancelled.total_value)],
    ['Omzet pembanding', `${formatRupiah(data.revenue.revenue)} · ${formatNumber(data.revenue.transactions)} transaksi`],
  ];
  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <DashboardPanel title="Ringkasan" description="Nilai pembelian adalah informasi, bukan pembukuan. Omzet pembanding sama dengan tab Penjualan.">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-btn bg-beige/40 p-3"><dt className="text-xs text-cocoa-muted">{label}</dt><dd className="font-semibold tabular-nums text-cocoa">{value}</dd></div>
          ))}
        </dl>
      </DashboardPanel>
      <OperationsPurchaseTables purchases={data.purchases} />
      <OperationsMovementTable rows={data.movements} />
      <OperationsUsageTable rows={data.usage} />
      <OperationsProductionTables production={data.production} plan={data.plan_vs_output} />
      <OperationsAnalysisPanel requirements={data.analysis.requirements} />
    </div>
  );
}
