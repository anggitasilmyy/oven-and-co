// pages/customer/DetailProdukPage.jsx
// FR-08 · FR-09 · FR-25 · UC-05 · C-09 Detail Produk & Tambah ke Keranjang
// Step 5.1: galeri, badge + tanggal siap tercepat (BR-01/BR-02), varian, jumlah ≤ stok ready, catatan,
// date picker pre-order, deskripsi/komposisi/alergen, cuplikan ulasan, wishlist, toast.
// Produk custom diarahkan ke Custom Cake Builder (C-11).
// FocusPageGrid + ActionBar: < lg bar bawah · ≥ lg panel aksi sticky di kanan.

import { Navigate, useParams } from 'react-router-dom';
import { PackageX } from 'lucide-react';
import FocusPageGrid from '../../components/layout/FocusPageGrid';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Toast, { useToast } from '../../components/ui/Toast';
import ProductDetailContent from '../../components/customer/ProductDetailContent';
import useServiceQuery from '../../hooks/useServiceQuery';
import useWishlist from '../../hooks/useWishlist';
import { getProductDetail } from '../../services/productDetailService';
import { AVAILABILITY_TYPE } from '../../constants/product';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function DetailProdukPage() {
  const { id } = useParams();
  const detail = useServiceQuery(() => getProductDetail(id), [id]);
  const { toast, showToast, hideToast } = useToast();
  const wishlist = useWishlist(showToast);
  const product = detail.data;
  // Data produk sebelumnya masih dipegang saat berpindah ke produk lain
  const stale = product && String(product.product_id) !== String(id);

  let body;
  if (detail.error) {
    body = <div className="page-container py-6"><ErrorState message="Detail produk gagal dimuat." onRetry={detail.reload} /></div>;
  } else if (detail.loading && (!product || stale)) {
    body = (
      <FocusPageGrid aside={<div className="hidden lg:block card p-6"><Skeleton count={3} /></div>}>
        <div className="space-y-5" aria-busy="true" aria-label="Memuat detail produk">
          <Skeleton variant="block" className="aspect-[4/3] w-full rounded-card" />
          <Skeleton count={4} />
        </div>
      </FocusPageGrid>
    );
  } else if (!product) {
    body = (
      <div className="page-container py-10">
        <div className="card">
          <EmptyState
            icon={<PackageX size={36} aria-hidden="true" />}
            title="Produk tidak ditemukan"
            description="Produk ini tidak tersedia atau sudah tidak dijual."
          />
        </div>
      </div>
    );
  } else if (product.availability_type === AVAILABILITY_TYPE.CUSTOM) {
    return <Navigate to={CUSTOMER_ROUTES.CUSTOM_CAKE} replace />;
  } else {
    // key: state pilihan direset saat berpindah produk
    body = <ProductDetailContent key={product.product_id} product={product} wishlist={wishlist} notify={showToast} />;
  }

  return (
    <>
      {body}
      <Toast {...toast} onClose={hideToast} />
    </>
  );
}
