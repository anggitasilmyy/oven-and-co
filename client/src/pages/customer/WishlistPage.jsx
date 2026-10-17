// pages/customer/WishlistPage.jsx
// FR-25 · UC-17 · C-23 Wishlist
// Step 5.5: grid kartu produk standar dengan hati terisi (2 kolom HP, 3 tablet, 4 desktop); menekan hati menghapus
// produk dari wishlist. Empty state "Simpan favoritmu di sini".

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import AccountLayout from '../../layouts/AccountLayout';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import ProductGrid from '../../components/customer/ProductGrid';
import useServiceQuery from '../../hooks/useServiceQuery';
import useQuickAddToCart from '../../hooks/useQuickAddToCart';
import { getMyWishlistProducts, setWishlisted } from '../../services/wishlistService';
import { CUSTOMER_ROUTES } from '../../constants/routes';

export default function WishlistPage() {
  const navigate = useNavigate();
  const query = useServiceQuery(() => getMyWishlistProducts(), []);
  const { addProduct, toast, showToast, hideToast } = useQuickAddToCart();
  const [removedIds, setRemovedIds] = useState(() => new Set());
  const [pendingId, setPendingId] = useState(null);

  const products = query.data ? query.data.filter((p) => !removedIds.has(p.product_id)) : null;

  const wishlist = {
    isWishlisted: () => true,
    pendingId,
    toggleWishlist: async (product) => {
      setPendingId(product.product_id);
      try {
        await setWishlisted(product.product_id, false);
        setRemovedIds((prev) => new Set(prev).add(product.product_id));
        showToast('success', `${product.name} dihapus dari wishlist.`);
      } catch (err) {
        showToast('error', err.message || 'Wishlist gagal diperbarui.');
      } finally {
        setPendingId(null);
      }
    },
  };

  const empty = (
    <div className="card">
      <EmptyState
        icon={<Heart size={36} aria-hidden="true" />}
        title="Simpan favoritmu di sini"
        description="Tekan ikon hati di kartu produk untuk menyimpannya ke wishlist."
        actionLabel="Jelajahi Katalog"
        onAction={() => navigate(CUSTOMER_ROUTES.KATALOG)}
      />
    </div>
  );

  return (
    <AccountLayout>
      <div className="space-y-5 lg:space-y-6">
        <PageHeader title="Wishlist" description={products?.length ? `${products.length} produk favorit` : undefined} />
        {query.error ? (
          <ErrorState message={query.error.message} onRetry={query.reload} />
        ) : (
          <ProductGrid
            products={products}
            loading={query.loading}
            cols={{ base: 2, md: 3, xl: 4 }}
            onAdd={addProduct}
            wishlist={wishlist}
            empty={empty}
            label="Produk wishlist"
          />
        )}
      </div>
      <Toast {...toast} onClose={hideToast} />
    </AccountLayout>
  );
}
