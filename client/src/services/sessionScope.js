// services/sessionScope.js
// Step 6.3 (temuan L1) · FR-12 · FR-13 — state yang terikat identitas pengguna (draft checkout) dikosongkan saat
// identitas BENAR-BENAR berganti (login, logout, pengguna lain dari tab lain). Perubahan profil pengguna yang sama
// (nama, email) atau token baru untuk pengguna yang sama tidak mengubah kunci identitas → draft tidak direset.

import useAuthStore from '../stores/useAuthStore';
import useCheckoutStore from '../stores/useCheckoutStore';
import { getSessionTreeKey } from '../utils/sessionIdentity';

/** Draft checkout milik identitas lain (mis. dipulihkan dari sessionStorage) → kosongkan */
function resetForeignCheckout(currentKey) {
  const { ownerKey, resetCheckout } = useCheckoutStore.getState();
  if (ownerKey !== null && ownerKey !== currentKey) resetCheckout();
}

/**
 * Mulai menjaga state per identitas. Dipanggil sekali dari useSessionSync.
 * @returns {() => void} pelepas langganan
 */
export function startSessionScope() {
  let currentKey = getSessionTreeKey(useAuthStore.getState().user);
  resetForeignCheckout(currentKey);

  return useAuthStore.subscribe((state) => {
    const nextKey = getSessionTreeKey(state.user);
    if (nextKey === currentKey) return;
    currentKey = nextKey;
    useCheckoutStore.getState().resetCheckout();
  });
}
