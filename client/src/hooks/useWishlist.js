// hooks/useWishlist.js
// Step 5.1 · FR-25 — tombol hati di kartu produk & detail
// Tamu diarahkan ke /masuk lalu kembali ke halaman ini (state.returnTo, sama seperti ProtectedRoute).

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { getMyWishlistIds, setWishlisted } from '../services/wishlistService';
import { ROLES } from '../constants/roles';
import { CUSTOMER_ROUTES } from '../constants/routes';

/**
 * @param {Function} [notify] — (type, message) → tampilkan toast di halaman
 * @returns {{ isWishlisted(id), toggleWishlist(product), pendingId }}
 */
export default function useWishlist(notify) {
  const user = useAuthStore((s) => s.user);
  const isCustomer = user?.role === ROLES.CUSTOMER;
  const navigate = useNavigate();
  const location = useLocation();
  const [ids, setIds] = useState(() => new Set());
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => {
    if (!isCustomer) return undefined;
    let active = true;
    getMyWishlistIds().then(
      (list) => active && setIds(new Set(list)),
      () => active && notify?.('error', 'Wishlist gagal dimuat.')
    );
    return () => {
      active = false;
    };
    // notify sengaja tidak menjadi dependency: hanya dimuat ulang saat pengguna berganti
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomer, user?.user_id]);

  const toggleWishlist = useCallback(
    async (product) => {
      if (!user) {
        navigate(CUSTOMER_ROUTES.MASUK, { state: { returnTo: location.pathname + location.search } });
        return;
      }
      if (!isCustomer) {
        notify?.('info', 'Wishlist hanya tersedia untuk akun pelanggan.');
        return;
      }
      const next = !ids.has(product.product_id);
      setPendingId(product.product_id);
      try {
        await setWishlisted(product.product_id, next);
        setIds((prev) => {
          const copy = new Set(prev);
          if (next) copy.add(product.product_id);
          else copy.delete(product.product_id);
          return copy;
        });
        notify?.('success', next ? `${product.name} disimpan ke wishlist.` : `${product.name} dihapus dari wishlist.`);
      } catch (err) {
        notify?.('error', err.message || 'Wishlist gagal diperbarui.');
      } finally {
        setPendingId(null);
      }
    },
    [user, isCustomer, ids, navigate, location.pathname, location.search, notify]
  );

  // Tamu & non-pelanggan selalu tampil tidak tersimpan
  const isWishlisted = useCallback((id) => isCustomer && ids.has(id), [isCustomer, ids]);

  return { isWishlisted, toggleWishlist, pendingId };
}
