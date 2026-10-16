// stores/useCheckoutStore.js
// Step 5.3 · FR-12 · FR-13 · C-13 → C-14 — pilihan checkout yang dibawa ke halaman Metode Pembayaran.
// Disimpan di sessionStorage agar tidak hilang saat refresh, tetapi tidak terbawa ke sesi peramban berikutnya.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FULFILLMENT_TYPE } from '../constants/orderStatus';

const INITIAL = {
  fulfillment: FULFILLMENT_TYPE.PICKUP,
  readyDate: null,
  timeSlot: null,
  addressId: null,
  voucherCode: null,
  usePoints: false,
};

const useCheckoutStore = create(
  persist(
    (set) => ({
      ...INITIAL,
      /** Ubah sebagian pilihan checkout */
      setCheckout: (patch) => set(patch),
      /** Kosongkan setelah pesanan dibuat */
      resetCheckout: () => set(INITIAL),
    }),
    { name: 'ovenco_checkout', storage: createJSONStorage(() => sessionStorage) }
  )
);

export default useCheckoutStore;
