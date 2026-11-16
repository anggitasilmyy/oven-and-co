// pages/admin/ProduksiPage.jsx
// CR-04b · FR-45, FR-46 · UC-36, UC-37 · BR-25 – BR-29, BR-36 · K09 – K14 · AD-13 Produksi (Staf & Owner) — daftar Work
// Order (default) & detail WO di ?wo=<id> (mulai, batal, pengeluaran bahan, selesaikan, pembalik/koreksi). Hasil produksi
// hanya dicatat (K13): tidak menambah stok produk siap jual. Data lewat services/workOrderService (mock = API).

import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import WorkOrderPanel from '../../components/admin/WorkOrderPanel';
import WorkOrderDetail from '../../components/admin/WorkOrderDetail';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getWorkOrders, getWorkOrder } from '../../services/workOrderService';
import { getRawMaterials } from '../../services/stockService';
import { getAdminProducts } from '../../services/adminProductService';
import { PRODUCTION_OUTPUT_NOTE } from '../../constants/workOrder';

function Loading() {
  return (
    <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat data produksi">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
    </div>
  );
}

export default function ProduksiPage() {
  const [params, setParams] = useSearchParams();
  const woId = params.get('wo');
  const orders = useServiceQuery(getWorkOrders);
  const products = useServiceQuery(getAdminProducts);
  const materials = useServiceQuery(getRawMaterials);
  const detail = useServiceQuery(() => (woId ? getWorkOrder(woId) : Promise.resolve(null)), [woId]);
  const { toast, showToast, hideToast } = useToast();
  const failed = orders.error || products.error || materials.error || (woId && detail.error);
  const ready = orders.data && products.data && materials.data && (!woId || detail.data);
  const reloadAll = () => { orders.reload(); products.reload(); materials.reload(); detail.reload(); };
  const changed = (message, tone = 'success') => { showToast(tone, message); reloadAll(); };

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader screenCode="AD-13" title="Produksi" description="Kelola work order, catat pemakaian bahan, dan catat hasil produksi." />
      <p role="note" className="rounded-btn border border-peach bg-peach/30 px-4 py-3 text-sm text-cocoa">{PRODUCTION_OUTPUT_NOTE}</p>
      {failed && <ErrorState message={failed.message || 'Data produksi gagal dimuat.'} onRetry={reloadAll} />}
      {!failed && !ready && <Loading />}
      {!failed && ready && !woId && (
        <WorkOrderPanel orders={orders.data} products={products.data.rows} onOpen={(id) => setParams({ wo: id })}
          onCreated={(wo, message) => { changed(message); setParams({ wo: wo.wo_id }); }} />
      )}
      {!failed && ready && woId && (
        <WorkOrderDetail key={woId} order={detail.data} products={products.data.rows} materials={materials.data.rows}
          onBack={() => setParams({})} onChanged={changed} />
      )}
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
