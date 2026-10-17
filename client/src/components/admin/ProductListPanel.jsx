// components/admin/ProductListPanel.jsx
// Step 5.7 · FR-30 · AD-06 — tab Produk: ringkasan, tabel (≥ md) / kartu (< md), toggle aktif langsung dari daftar

import { useState } from 'react';
import { Package } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import DataTable from './DataTable';
import ProductCardList from './ProductCardList';
import { buildProductColumns } from './productColumns';
import { setProductActive } from '../../services/adminProductService';

/**
 * @param {{data, error, loading, reload}} query — hasil useServiceQuery(getAdminProducts)
 * @param {Function} onEdit — (productId) → void
 * @param {Function} onToast — (type, message) → void
 */
export default function ProductListPanel({ query, onEdit, onToast }) {
  const [pendingId, setPendingId] = useState(null);

  const toggle = async (row, checked) => {
    setPendingId(row.product_id);
    try {
      await setProductActive(row.product_id, checked);
      onToast('success', checked ? `${row.name} aktif dan tampil di katalog` : `${row.name} dinonaktifkan dan disembunyikan dari web`);
      query.reload();
    } catch (err) {
      onToast('error', err.message);
    } finally {
      setPendingId(null);
    }
  };

  if (query.error) return <ErrorState message={query.error.message || 'Daftar produk gagal dimuat.'} onRetry={query.reload} />;
  if (!query.data) {
    return (
      <div className="card-admin space-y-3 p-4" aria-busy="true" aria-label="Memuat produk">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="block" className="h-14 w-full" />)}
      </div>
    );
  }

  const { rows } = query.data;
  if (rows.length === 0) {
    return (
      <div className="card-admin">
        <EmptyState icon={<Package size={32} aria-hidden="true" />} title="Belum ada produk" description="Tambahkan produk pertama agar tampil di katalog." />
      </div>
    );
  }

  const handlers = { onToggle: toggle, onEdit, pendingId };
  return (
    <section aria-label="Daftar produk" className={`space-y-4 transition-opacity ${query.loading ? 'opacity-60' : ''}`} aria-busy={query.loading}>
      <p className="text-sm text-cocoa/70">
        {rows.length} produk · {rows.filter((r) => r.is_active).length} aktif di katalog
      </p>
      <div className="md:hidden">
        <ProductCardList rows={rows} {...handlers} />
      </div>
      <div className="card-admin hidden p-1 md:block 2xl:p-3">
        <DataTable label="Daftar produk" columns={buildProductColumns(handlers)} rows={rows} rowKey={(r) => r.product_id} minWidth="min-w-[900px]" />
      </div>
    </section>
  );
}
