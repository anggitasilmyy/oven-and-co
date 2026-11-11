// constants/recipe.js
// CR-03 · FR-39/FR-40 · BR-13 – BR-15 (SPEC §5, §6, §10) — konstanta komposisi bahan & estimasi kebutuhan bahan.
// Sama dengan server utils/businessConstants.js (MATERIAL_DEMAND_STATUSES, RECIPE_MAX_ITEMS, …).

import { ORDER_STATUS } from './orderStatus';

/** Status pesanan yang masih membutuhkan bahan (terpisah dari PRODUCTION_STATUSES AD-05) */
export const MATERIAL_DEMAND_STATUSES = Object.freeze([ORDER_STATUS.DIKONFIRMASI, ORDER_STATUS.SEDANG_DISIAPKAN]);

/** Maks. bahan per produk (asumsi prototype, SPEC §10) */
export const RECIPE_MAX_ITEMS = 30;

/** Takaran DECIMAL(10,3) — maks. 9.999.999,999 */
export const RECIPE_QTY_DECIMALS = 3;

/** Jendela tanggal target estimasi: hari ini s.d. hari ini + 29 */
export const MATERIAL_REQUIREMENT_WINDOW_DAYS = 30;

/** Status kebutuhan per bahan (dinilai dari sisa setelah dialokasikan) */
export const MATERIAL_DEMAND_STATUS = Object.freeze({ KURANG: 'kurang', MENIPIS: 'menipis', CUKUP: 'cukup' });
