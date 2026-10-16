// services/wishlistService.js
// Step 5.1 · FR-25 · UC-17 — simpan/hapus produk di wishlist pelanggan login (tabel wishlists)
// Hanya untuk pelanggan; pengguna diambil dari sesi (tidak pernah menerima user_id dari UI).

import { apiClient } from './apiClient';
import { getTables, updateTable } from './mock/db';
import { requireMockRole } from './mock/mockSession';
import { ROLES } from '../constants/roles';

/** Baris wishlist yang sah saja (data localStorage bisa rusak/terubah manual) */
const validRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((w) => Number.isFinite(w?.user_id) && Number.isFinite(w?.product_id));

/** @returns {Promise<number[]>} product_id yang ada di wishlist pelanggan login */
export function getMyWishlistIds() {
  return apiClient('/me/wishlist', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      return validRows(getTables('wishlists').wishlists).filter((w) => w.user_id === user.user_id).map((w) => w.product_id);
    },
  });
}

/**
 * Tambah (wishlisted = true) atau hapus produk dari wishlist.
 * @returns {Promise<{product_id, wishlisted}>}
 */
export function setWishlisted(productId, wishlisted) {
  const id = Number(productId);
  return apiClient(`/me/wishlist/${id}`, {
    method: wishlisted ? 'POST' : 'DELETE',
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const product = getTables('products').products.find((p) => p.product_id === id && p.is_active);
      if (!product) throw new Error('Produk tidak ditemukan');
      updateTable('wishlists', (rows) => {
        const others = validRows(rows).filter((w) => !(w.user_id === user.user_id && w.product_id === id));
        return wishlisted
          ? [...others, { user_id: user.user_id, product_id: id, created_at: new Date().toISOString() }]
          : others;
      });
      return { product_id: id, wishlisted };
    },
  });
}
