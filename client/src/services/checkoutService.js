// services/checkoutService.js
// Step 5.3 · FR-12 · FR-13 · BR-09 · BR-10 · BR-12 · C-13 Checkout — data toko, alamat tersimpan,
// voucher milik pelanggan, saldo poin, dan metode bayar aktif. Hanya untuk pelanggan login (BR-04).

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey, getMockCurrentTime } from './mock/mockClock';
import { requireMockRole } from './mock/mockSession';
import { getPointBalance, distanceKm, getDeliveryQuote, isVoucherActiveOn } from '../utils/businessRules';
import { ROLES } from '../constants/roles';

/** @returns {Promise<object>} konteks checkout pelanggan login */
export function getCheckoutContext() {
  return apiClient('/checkout/context', {
    mockHandler: () => {
      const user = requireMockRole(ROLES.CUSTOMER);
      const t = getTables('store_settings', 'addresses', 'vouchers', 'user_vouchers', 'point_transactions', 'payment_methods');
      const store = t.store_settings;
      const todayKey = getMockTodayKey();
      const addresses = t.addresses
        .filter((a) => a.user_id === user.user_id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((a) => ({ ...a, ...getDeliveryQuote(distanceKm(store, a), store) }));
      const vouchers = t.user_vouchers
        .filter((c) => c.user_id === user.user_id)
        .map((claim) => ({ claim, voucher: t.vouchers.find((v) => v.voucher_id === claim.voucher_id) }))
        .filter((x) => x.voucher)
        .map((x) => ({ ...x, usable: !x.claim.used_at && isVoucherActiveOn(x.voucher, todayKey) }));
      return {
        store: { name: store.store_name, address: store.address, latitude: store.latitude, longitude: store.longitude },
        settings: store,
        addresses,
        vouchers,
        point_balance: getPointBalance(t.point_transactions.filter((tx) => tx.user_id === user.user_id)),
        payment_methods: t.payment_methods.filter((m) => m.is_active),
        today_key: todayKey,
        now: getMockCurrentTime().toISOString(),
      };
    },
  });
}
