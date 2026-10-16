// hooks/useRestoreUserCart.js
// FR-04 · BR-04 — saat aplikasi dimuat (mis. setelah refresh) dan sesi pelanggan masih ada,
// muat keranjang akun pelanggan. Tanpa ini useCartStore selalu mulai dari keranjang tamu.
// Hanya memanggil aksi loadUserCart yang SUDAH ADA di useCartStore.

import { useEffect } from 'react';
import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { ROLES } from '../constants/roles';

export default function useRestoreUserCart() {
  const user = useAuthStore((s) => s.user);
  const loadUserCart = useCartStore((s) => s.loadUserCart);
  const customerId = user?.role === ROLES.CUSTOMER ? user.user_id : null;

  useEffect(() => {
    if (customerId != null) loadUserCart(customerId);
  }, [customerId, loadUserCart]);
}
