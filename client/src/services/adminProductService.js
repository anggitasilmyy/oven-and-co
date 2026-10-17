// services/adminProductService.js
// Step 5.7 · FR-30 · FR-31 · UC-23 · AD-06 — Produk & Opsi Custom Cake (Staf & Owner, SPEC §2)
// Produk nonaktif disembunyikan dari web; hanya opsi aktif yang muncul di Custom Cake Builder.

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import { buildAdminProductRows, buildAdminProductForm, buildAdminCustomOptions } from './mock/adminCatalogViews';
import {
  saveAdminProduct, setAdminProductActive, saveAdminCustomOption, setAdminCustomOptionActive,
} from './mock/adminCatalogWrites';
import { ROLES } from '../constants/roles';

const ADMIN_ROLES = [ROLES.STAF, ROLES.OWNER];
const asAdmin = (fn) => (...args) => {
  requireMockRole(...ADMIN_ROLES);
  return fn(...args);
};

/** @returns {Promise<{rows, categories}>} semua produk (aktif & nonaktif) untuk tabel AD-06 */
export function getAdminProducts() {
  return apiClient('/admin/products', { mockHandler: asAdmin(buildAdminProductRows) });
}

/** @returns {Promise<object|null>} produk + foto + varian untuk form ubah */
export function getAdminProduct(productId) {
  return apiClient(`/admin/products/${productId}`, { mockHandler: asAdmin(() => buildAdminProductForm(productId)) });
}

/**
 * Tambah (productId kosong) atau ubah produk. Error validasi membawa `fieldErrors` di mode mock.
 * @param {number|null} productId
 * @param {object} input — field form produk + photos [{image_id?, image_url}] + variants
 */
export function saveProduct(productId, input) {
  return apiClient(productId == null ? '/admin/products' : `/admin/products/${productId}`, {
    method: productId == null ? 'POST' : 'PUT',
    body: input,
    mockHandler: asAdmin(() => saveAdminProduct(productId, input)),
  });
}

/** Aktifkan/nonaktifkan produk dari tabel */
export function setProductActive(productId, isActive) {
  return apiClient(`/admin/products/${productId}/active`, {
    method: 'PATCH',
    body: { is_active: isActive },
    mockHandler: asAdmin(() => setAdminProductActive(productId, isActive)),
  });
}

/** @returns {Promise<{groups, custom_product, lead_time_days}>} opsi custom cake per kelompok */
export function getAdminCustomOptions() {
  return apiClient('/admin/custom-options', { mockHandler: asAdmin(buildAdminCustomOptions) });
}

/** Tambah (optionId kosong) atau ubah opsi custom cake */
export function saveCustomOption(optionId, input) {
  return apiClient(optionId == null ? '/admin/custom-options' : `/admin/custom-options/${optionId}`, {
    method: optionId == null ? 'POST' : 'PUT',
    body: input,
    mockHandler: asAdmin(() => saveAdminCustomOption(optionId, input)),
  });
}

/** Aktifkan/nonaktifkan opsi (minimal satu opsi aktif per kelompok) */
export function setCustomOptionActive(optionId, isActive) {
  return apiClient(`/admin/custom-options/${optionId}/active`, {
    method: 'PATCH',
    body: { is_active: isActive },
    mockHandler: asAdmin(() => setAdminCustomOptionActive(optionId, isActive)),
  });
}
