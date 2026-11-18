// components/admin/SalesReportBody.jsx
// FR-33 · UC-27 · A-08 · AD-08 tab Penjualan — isi laporan penjualan (markup dipindah apa adanya dari LaporanPage saat
// CR-04c menambah tab Operasional; perilaku & tampilan tidak berubah): KPI, per hari, terlaris, metode bayar, transaksi.

import DashboardPanel from './DashboardPanel';
import ReportKpis from './ReportKpis';
import DailySalesBarChart from './DailySalesBarChart';
import BestSellersPanel from './BestSellersPanel';
import PaymentMethodDonut from './PaymentMethodDonut';
import ReportTransactionsTable from './ReportTransactionsTable';

/** @param {{data: object|null, loading: boolean}} props — data = getSalesReport */
export default function SalesReportBody({ data, loading }) {
  return (
    <>
      {data && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
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
    </>
  );
}
