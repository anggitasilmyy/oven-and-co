// services/recipeService.js
// CR-03 CP6 · FR-39 · UC-31 · BR-13 · AD-06 — komposisi bahan per produk (Staf & Owner). Kontrak API CR-03 §B7.1 – §B7.2:
// GET → { product_id, product_name, availability_type, items: [{ material_id, name, unit, qty_per_unit:number }] };
// PUT { items: [{ material_id:string, qty_per_unit:string desimal }] } mengganti seluruh komposisi.

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { buildProductRecipe, saveProductRecipe as saveMockRecipe } from './mock/recipeAdmin';
import { ROLES } from '../constants/roles';

const asAdmin = (fn) => (...args) => {
  requireMockRole(ROLES.STAF, ROLES.OWNER);
  return fn(...args);
};

/** @returns {Promise<object>} komposisi produk (produk aktif maupun nonaktif) */
export function getProductRecipe(productId) {
  return apiClient(`/admin/products/${productId}/materials`, { mockHandler: asAdmin(() => buildProductRecipe(productId)) });
}

/**
 * Simpan seluruh komposisi produk. Takaran WAJIB string desimal (JSON number ditolak server 400).
 * @param {string|number} productId
 * @param {Array<{material_id: string, qty_per_unit: string}>} items
 */
export function saveProductRecipe(productId, items) {
  const body = { items };
  return apiClient(`/admin/products/${productId}/materials`, {
    method: 'PUT',
    body,
    mockHandler: asAdmin(() => saveMockRecipe(productId, body)),
  });
}
