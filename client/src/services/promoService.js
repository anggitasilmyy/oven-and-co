// services/promoService.js
// Step 4 · FR-05 · C-05 — banner promo dari voucher aktif (SPEC §8 vouchers)

import { apiClient } from './apiClient';
import { getTables } from './mock/db';
import { getMockTodayKey } from './mock/mockClock';
import { isVoucherActiveOn } from '../utils/businessRules';

/**
 * Promo aktif hari ini (is_active, dalam periode, kuota tersisa).
 * @returns {Promise<Array<{voucher_id, code, title, discount_type, discount_value, valid_to, product_id, product_name, image_url}>>}
 */
export function getActivePromos() {
  return apiClient('/promos/active', {
    mockHandler: () => {
      const todayKey = getMockTodayKey();
      const { vouchers, products, product_images } = getTables('vouchers', 'products', 'product_images');
      return vouchers
        .filter((v) => isVoucherActiveOn(v, todayKey))
        .map((v) => ({
          voucher_id: v.voucher_id,
          code: v.code,
          title: v.title,
          discount_type: v.discount_type,
          discount_value: v.discount_value,
          valid_to: v.valid_to,
          product_id: v.product_id,
          product_name: products.find((p) => p.product_id === v.product_id)?.name ?? null,
          image_url: product_images.find((img) => img.product_id === v.product_id)?.image_url ?? null,
        }));
    },
  });
}
