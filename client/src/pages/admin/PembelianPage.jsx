// pages/admin/PembelianPage.jsx
// CR-04a CP6 · FR-41 – FR-43 · UC-33 – UC-35 · AD-12 Pembelian (Staf & Owner) — tab Purchase Order (default) & Supplier
// (?tab=supplier); detail PO di ?po=<id> (penerimaan, pembalik, koreksi). Data lewat services/purchasingService (mock = API).

import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Tabs from '../../components/ui/Tabs';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import SupplierPanel from '../../components/admin/SupplierPanel';
import PurchaseOrderPanel from '../../components/admin/PurchaseOrderPanel';
import PurchaseOrderDetail from '../../components/admin/PurchaseOrderDetail';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getSuppliers, getPurchaseOrders, getPurchaseOrder } from '../../services/purchasingService';
import { getRawMaterials } from '../../services/stockService';
import { PURCHASING_TAB, PURCHASING_TABS } from '../../constants/purchasing';

function Loading({ label }) {
  return (
    <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label={label}>
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
    </div>
  );
}

export default function PembelianPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === PURCHASING_TAB.SUPPLIER ? PURCHASING_TAB.SUPPLIER : PURCHASING_TAB.PO;
  const poId = tab === PURCHASING_TAB.PO ? params.get('po') : null;
  const suppliers = useServiceQuery(getSuppliers);
  const orders = useServiceQuery(getPurchaseOrders);
  const materials = useServiceQuery(getRawMaterials);
  const detail = useServiceQuery(() => (poId ? getPurchaseOrder(poId) : Promise.resolve(null)), [poId]);
  const { toast, showToast, hideToast } = useToast();
  const failed = suppliers.error || orders.error || (tab === PURCHASING_TAB.SUPPLIER && materials.error) || (poId && detail.error);
  const ready = suppliers.data && orders.data && (tab !== PURCHASING_TAB.SUPPLIER || materials.data) && (!poId || detail.data);
  const reloadAll = () => { suppliers.reload(); orders.reload(); materials.reload(); detail.reload(); };
  const changed = (message, tone = 'success') => { showToast(tone, message); reloadAll(); };

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader screenCode="AD-12" title="Pembelian" description="Kelola supplier, purchase order, dan penerimaan bahan baku. Stok bahan bertambah saat penerimaan dicatat." />
      <Tabs tabs={PURCHASING_TABS} value={tab} onChange={(key) => setParams(key === PURCHASING_TAB.PO ? {} : { tab: key })} label="Bagian pembelian" />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {failed && <ErrorState message={failed.message || 'Data pembelian gagal dimuat.'} onRetry={reloadAll} />}
        {!failed && !ready && <Loading label="Memuat data pembelian" />}
        {!failed && ready && tab === PURCHASING_TAB.SUPPLIER && (
          <SupplierPanel suppliers={suppliers.data} materials={materials.data.rows} onChanged={changed} />
        )}
        {!failed && ready && tab === PURCHASING_TAB.PO && !poId && (
          <PurchaseOrderPanel orders={orders.data} suppliers={suppliers.data} onOpen={(id) => setParams({ po: id })}
            onCreated={(po, message) => { changed(message); setParams({ po: po.po_id }); }} />
        )}
        {!failed && ready && poId && (
          <PurchaseOrderDetail key={poId} order={detail.data} suppliers={suppliers.data} onBack={() => setParams({})} onChanged={changed} />
        )}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
