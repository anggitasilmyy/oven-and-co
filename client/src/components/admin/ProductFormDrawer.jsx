// components/admin/ProductFormDrawer.jsx
// Step 5.7 · FR-30 · AD-06 — memuat produk yang diubah (skeleton/error) lalu menampilkan ProductForm

import Drawer from '../ui/Drawer';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import ProductForm from './ProductForm';
import useServiceQuery from '../../hooks/useServiceQuery';
import { getAdminProduct } from '../../services/adminProductService';

/**
 * @param {number|null} productId — null = tambah produk
 * @param {Array} categories
 * @param {Array} products
 * @param {Function} onClose
 * @param {Function} onSaved
 */
export default function ProductFormDrawer({ productId, onClose, ...props }) {
  const isNew = productId == null;
  const query = useServiceQuery(() => (isNew ? Promise.resolve(null) : getAdminProduct(productId)), [productId]);

  if (isNew) return <ProductForm product={null} onClose={onClose} {...props} />;
  if (!query.loading && query.data) return <ProductForm key={productId} product={query.data} onClose={onClose} {...props} />;

  return (
    <Drawer isOpen onClose={onClose} title="Ubah produk">
      {query.error ? (
        <ErrorState message={query.error.message || 'Produk gagal dimuat.'} onRetry={query.reload} />
      ) : query.loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Memuat produk">
          <Skeleton variant="block" className="h-28 w-full" />
          <Skeleton variant="text" count={4} />
        </div>
      ) : (
        <p className="text-sm text-cocoa/70">Produk tidak ditemukan.</p>
      )}
    </Drawer>
  );
}
