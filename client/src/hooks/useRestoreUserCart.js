// hooks/useRestoreUserCart.js
// FR-04 · BR-04 — saat aplikasi dimuat (mis. setelah refresh) dan sesi pelanggan masih ada,
// muat keranjang akun pelanggan. Tanpa ini useCartStore selalu mulai dari keranjang tamu.
// Step 6.3: id pemilik dari helper bersama (utils/sessionIdentity, mendukung mock user_id & API userId) dan
// keranjang dipilih lewat aksi bersama useCartStore.loadCartForUser (dipakai juga login admin & sinkron antar-tab).

import { useEffect } from 'react';
import useAuthStore from '../stores/useAuthStore';
import useCartStore from '../stores/useCartStore';
import { getCartOwnerId } from '../utils/sessionIdentity';

export default function useRestoreUserCart() {
  const ownerId = useAuthStore((s) => getCartOwnerId(s.user));
  const loadCartForUser = useCartStore((s) => s.loadCartForUser);

  useEffect(() => {
    // Hanya pemilik keranjang yang menentukan; perubahan nama/email (id sama) tidak memuat ulang keranjang
    if (ownerId) loadCartForUser(useAuthStore.getState().user);
  }, [ownerId, loadCartForUser]);
}
