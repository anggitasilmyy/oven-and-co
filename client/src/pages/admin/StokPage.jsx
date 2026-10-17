// pages/admin/StokPage.jsx
// FR-32 · UC-24 · BR-01 · TF-12 · AD-07 Stok Harian & Bahan Baku (Staf & Owner)
// Step 5.7: tab "Stok Produk Harian" (rencana stok produk ready hari ini; terjual dari pesanan) dan tab "Bahan Baku"
// (stok, minimum, status Aman/Menipis/Habis, Catat Stok Masuk). Tab disimpan di URL (?tab=bahan).

import { useSearchParams } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import DailyStockEditor from '../../components/admin/DailyStockEditor';
import RawMaterialPanel from '../../components/admin/RawMaterialPanel';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getDailyStocks, updateDailyStocks, getRawMaterials } from '../../services/stockService';
import { STOCK_TAB, STOCK_TABS } from '../../constants/adminCatalog';
import { formatDate } from '../../utils/format';
import { parseDateKey } from '../../utils/date';

export default function StokPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === STOCK_TAB.BAHAN ? STOCK_TAB.BAHAN : STOCK_TAB.HARIAN;
  const daily = useServiceQuery(getDailyStocks);
  const materials = useServiceQuery(getRawMaterials);
  const { toast, showToast, hideToast } = useToast();
  const query = tab === STOCK_TAB.HARIAN ? daily : materials;

  const saveDaily = async (plans) => {
    await updateDailyStocks(plans);
    showToast('success', `Stok hari ini disimpan untuk ${plans.length} produk`);
    daily.reload();
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-07"
        title="Stok"
        description="Isi stok produk ready setiap pagi dan pantau bahan baku utama agar tidak kehabisan."
      />

      <Tabs tabs={STOCK_TABS} value={tab} onChange={(key) => setParams(key === STOCK_TAB.HARIAN ? {} : { tab: key })} label="Bagian stok" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {query.error && <ErrorState message={query.error.message || 'Data stok gagal dimuat.'} onRetry={query.reload} />}
        {!query.data && !query.error && (
          <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat stok">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
          </div>
        )}

        {tab === STOCK_TAB.HARIAN && daily.data && (
          <>
            <p className="text-sm text-cocoa/75">
              Stok hari ini · <span className="font-semibold text-cocoa">{formatDate(parseDateKey(daily.data.date))}</span>.
              Terjual bertambah saat pesanan dibuat dan kembali bila pesanan dibatalkan.
            </p>
            {daily.data.rows.length === 0 ? (
              <div className="card-admin">
                <EmptyState icon={<PackageOpen size={32} aria-hidden="true" />} title="Belum ada produk ready aktif" description="Aktifkan produk bertipe Ready di halaman Produk untuk mengisi stok harian." />
              </div>
            ) : (
              <DailyStockEditor key={daily.data.date} rows={daily.data.rows} onSave={saveDaily} />
            )}
          </>
        )}

        {tab === STOCK_TAB.BAHAN && materials.data && (
          <RawMaterialPanel board={materials.data} onChanged={(message) => { showToast('success', message); materials.reload(); }} />
        )}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
