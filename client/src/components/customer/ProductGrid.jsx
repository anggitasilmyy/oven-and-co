// components/customer/ProductGrid.jsx
// Step 5.1 · FR-06 · FR-07 — grid produk Katalog & Pencarian (skeleton saat memuat)
// Kolom: 2 (HP) · 3 (tablet) · 3–4 (desktop, lewat prop cols)

import ResponsiveGrid from '../layout/ResponsiveGrid';
import Skeleton from '../ui/Skeleton';
import ProductCard from './ProductCard';

/**
 * @param {Array|null} products
 * @param {{isWishlisted, toggleWishlist, pendingId}} [wishlist] — dari hooks/useWishlist
 * @param {Function} [onAdd] — tambah produk ready ke keranjang
 * @param {React.ReactNode} empty — tampilan bila tidak ada produk
 */
export default function ProductGrid({
  products, loading, cols = { base: 2, md: 3, xl: 4 }, onAdd, wishlist, empty, label = 'Daftar produk',
}) {
  if (loading && !products) {
    return (
      <ResponsiveGrid cols={cols} gap="sm" aria-busy="true" aria-label="Memuat produk">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="card" />)}
      </ResponsiveGrid>
    );
  }
  if (!products?.length) return empty ?? null;

  return (
    <ResponsiveGrid as="ul" cols={cols} gap="sm" aria-label={label} aria-busy={loading || undefined}>
      {products.map((product) => (
        <li key={product.product_id} className="flex">
          <ProductCard
            product={product}
            onAdd={onAdd}
            className="w-full"
            onToggleWishlist={wishlist?.toggleWishlist}
            wishlisted={wishlist?.isWishlisted(product.product_id)}
            wishlistPending={wishlist?.pendingId === product.product_id}
          />
        </li>
      ))}
    </ResponsiveGrid>
  );
}
