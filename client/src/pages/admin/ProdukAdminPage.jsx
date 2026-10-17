// pages/admin/ProdukAdminPage.jsx
// FR-30 · FR-31 · UC-23 · AD-06 Produk & Opsi Custom Cake (Staf & Owner)
// Step 5.7: tab Produk (tabel + drawer tambah/ubah, toggle aktif) dan tab Opsi Custom Cake (opsi per kelompok).
// Tab disimpan di URL (?tab=opsi). Produk nonaktif disembunyikan dari web; hanya opsi aktif yang muncul di builder.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Tabs from '../../components/ui/Tabs';
import Toast, { useToast } from '../../components/ui/Toast';
import ProductListPanel from '../../components/admin/ProductListPanel';
import CustomOptionsPanel from '../../components/admin/CustomOptionsPanel';
import ProductFormDrawer from '../../components/admin/ProductFormDrawer';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getAdminProducts } from '../../services/adminProductService';
import { PRODUCT_ADMIN_TAB, PRODUCT_ADMIN_TABS } from '../../constants/adminCatalog';

export default function ProdukAdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === PRODUCT_ADMIN_TAB.OPSI ? PRODUCT_ADMIN_TAB.OPSI : PRODUCT_ADMIN_TAB.PRODUK;
  const products = useServiceQuery(getAdminProducts);
  const { toast, showToast, hideToast } = useToast();
  // null = tertutup · { productId: null } = tambah · { productId } = ubah
  const [editing, setEditing] = useState(null);

  const changeTab = (key) => setParams(key === PRODUCT_ADMIN_TAB.PRODUK ? {} : { tab: key });
  const handleSaved = () => {
    showToast('success', editing?.productId == null ? 'Produk ditambahkan' : 'Produk disimpan');
    setEditing(null);
    products.reload();
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        screenCode="AD-06"
        title="Produk & Custom Cake"
        description="Kelola produk katalog beserta foto, varian, harga, tipe, dan lead time, serta pilihan Custom Cake Builder."
        actions={tab === PRODUCT_ADMIN_TAB.PRODUK && (
          <Button size="sm" onClick={() => setEditing({ productId: null })} disabled={!products.data} leftIcon={<Plus size={16} aria-hidden="true" />}>
            Tambah Produk
          </Button>
        )}
      />

      <Tabs tabs={PRODUCT_ADMIN_TABS} value={tab} onChange={changeTab} label="Bagian produk" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === PRODUCT_ADMIN_TAB.PRODUK ? (
          <ProductListPanel query={products} onEdit={(productId) => setEditing({ productId })} onToast={showToast} />
        ) : (
          <CustomOptionsPanel onToast={showToast} />
        )}
      </div>

      {editing && products.data && (
        <ProductFormDrawer
          productId={editing.productId}
          categories={products.data.categories}
          products={products.data.rows}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
      <Toast {...toast} onClose={hideToast} />
    </div>
  );
}
