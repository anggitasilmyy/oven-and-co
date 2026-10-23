// stores/useCheckoutStore.js
// Step 5.3 · FR-12 · FR-13 · C-13 → C-14 — pilihan checkout yang dibawa ke halaman Metode Pembayaran.
// Disimpan di sessionStorage agar tidak hilang saat refresh, tetapi tidak terbawa ke sesi peramban berikutnya.
// Step 6.3 (temuan L1): draft dicap `ownerKey` (kunci identitas sesi) dan direset bila identitas berganti
// (services/sessionScope.js), sehingga alamat/voucher/poin pengguna lain tidak terbawa.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FULFILLMENT_TYPE } from '../constants/orderStatus';
import useAuthStore from './useAuthStore';
import { getSessionTreeKey } from '../utils/sessionIdentity';

const INITIAL = {
  fulfillment: FULFILLMENT_TYPE.PICKUP,
  readyDate: null,
  timeSlot: null,
  addressId: null,
  voucherCode: null,
  usePoints: false,
  /** Kunci identitas pemilik draft (null = draft kosong) */
  ownerKey: null,
};

const useCheckoutStore = create(
  persist(
    (set) => ({
      ...INITIAL,
      /** Ubah sebagian pilihan checkout (dicap milik identitas sesi saat ini) */
      setCheckout: (patch) => set({ ...patch, ownerKey: getSessionTreeKey(useAuthStore.getState().user) }),
      /** Kosongkan setelah pesanan dibuat / identitas berganti */
      resetCheckout: () => set(INITIAL),
    }),
    { name: 'ovenco_checkout', storage: createJSONStorage(() => sessionStorage) }
  )
);

export default useCheckoutStore;
