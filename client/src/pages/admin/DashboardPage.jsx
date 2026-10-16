// pages/admin/DashboardPage.jsx
// FR-27 · UC-26 · AD-02 Dashboard (Owner)
// Step 4: KPI, grafik penjualan 7 hari, pesanan per status, pesanan terbaru, produk terlaris, stok menipis.

import { RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import DashboardPanel from '../../components/admin/DashboardPanel';
import DashboardKpis from '../../components/admin/DashboardKpis';
import DashboardSkeleton from '../../components/admin/DashboardSkeleton';
import SalesChart from '../../components/admin/SalesChart';
import OrderStatusDonut from '../../components/admin/OrderStatusDonut';
import DataTable from '../../components/admin/DataTable';
import OrderCardList from '../../components/admin/OrderCardList';
import BestSellersPanel from '../../components/admin/BestSellersPanel';
import LowStockPanel from '../../components/admin/LowStockPanel';
import { RECENT_ORDER_COLUMNS } from '../../components/admin/orderColumns';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getOwnerDashboard } from '../../services/dashboardService';
import { ADMIN_ROUTES } from '../../constants/routes';
import { SALES_WINDOW_DAYS } from '../../constants/dashboard';
import { formatDateFull } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

export default function DashboardPage() {
  const { data, loading, error, reload } = useServiceQuery(getOwnerDashboard);

  return (
    <div className="space-y-6">
      <PageHeader
        screenCode="AD-02"
        title="Dashboard"
        description={data ? `Ringkasan kinerja toko · ${formatDateFull(parseDateKey(data.todayKey))}` : 'Ringkasan kinerja toko'}
        actions={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading && !!data} leftIcon={<RefreshCw size={16} aria-hidden="true" />}>
            Muat ulang
          </Button>
        }
      />

      {error && <ErrorState message={error.message || 'Dashboard gagal dimuat.'} onRetry={reload} />}
      {!data && loading && <DashboardSkeleton />}

      {data && (
        <>
          <DashboardKpis kpi={data.kpi} />

          <div className="grid gap-6 xl:grid-cols-3">
            <DashboardPanel
              title={`Penjualan ${SALES_WINDOW_DAYS} Hari Terakhir`}
              description="Omzet pesanan lunas per tanggal pesan"
              className="xl:col-span-2"
            >
              <SalesChart data={data.salesChart} />
            </DashboardPanel>
            <DashboardPanel title="Pesanan per Status" description="Semua pesanan tercatat" action={{ to: ADMIN_ROUTES.PESANAN, label: 'Kelola' }}>
              <OrderStatusDonut counts={data.statusCounts} total={data.totalOrders} />
            </DashboardPanel>
          </div>

          <DashboardPanel title="Pesanan Terbaru" action={{ to: ADMIN_ROUTES.PESANAN, label: 'Lihat semua' }}>
            <div className="md:hidden">
              <OrderCardList rows={data.recentOrders} showPayment={false} />
            </div>
            <DataTable
              className="hidden md:block"
              label="Pesanan terbaru"
              columns={RECENT_ORDER_COLUMNS}
              rows={data.recentOrders}
              rowKey={(r) => r.order_id}
              minWidth="min-w-[560px]"
            />
          </DashboardPanel>

          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <DashboardPanel title="Produk Terlaris" description={`${SALES_WINDOW_DAYS} hari terakhir`}>
              <BestSellersPanel products={data.bestSellers} />
            </DashboardPanel>
            <DashboardPanel title="Stok Menipis" description="Bahan baku ≤ batas minimum" action={{ to: ADMIN_ROUTES.STOK, label: 'Buka Stok' }}>
              <LowStockPanel materials={data.lowStock} />
            </DashboardPanel>
          </div>
        </>
      )}
    </div>
  );
}
