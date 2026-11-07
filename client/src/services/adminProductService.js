// services/adminProductService.js
// Step 5.7 · FR-30 · FR-31 · UC-23 · AD-06 — Produk & Opsi Custom Cake (Staf & Owner, SPEC §2)
// Produk nonaktif disembunyikan dari web; hanya opsi aktif yang muncul di Custom Cake Builder.
// Step 6.6 (CP5 · G5): mode API mengirim foto baru sebagai file multipart sesuai kontrak server (lihat saveProduct).

import { apiClient, USE_MOCK } from './apiClient';
import { isMissingResourceError } from '../utils/apiErrors';
import { dataUrlToBlob } from '../utils/image';
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
  return apiClient(`/admin/products/${productId}`, { mockHandler: asAdmin(() => buildAdminProductForm(productId)) }).catch((err) => {
    // Step 6.6 (CP7 · G11): API 404 (produk tidak ada) atau 400 INVALID_ID → null, sama dengan mode mock; jaringan, 500, & error lain tetap dilempar
    if (isMissingResourceError(err)) return null;
    throw err;
  });
}

const PHOTO_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Step 6.6 (CP5 · G5) · kontrak server (routes/admin/product.routes.js, adminProductSave.service.js): foto tersimpan →
 * `{ image_id }`; foto baru (data URL hasil kompresi ProductPhotosField) → file ke-n pada field multipart `photos` +
 * `{ file_index: n }`, data lain sebagai string JSON `product`. Tanpa foto baru tetap JSON biasa. Urutan = sort_order.
 * @param {object} input
 * @returns {object|FormData}
 */
function toProductRequestBody(input) {
  if (!Array.isArray(input.photos)) return input;
  const files = [];
  const photos = input.photos.map((photo) => {
    if (photo.image_id != null) return { image_id: photo.image_id };
    const blob = dataUrlToBlob(photo.image_url);
    const extension = PHOTO_EXTENSIONS[blob?.type];
    if (!extension) throw new Error('Foto produk tidak bisa dibaca. Pilih ulang foto.');
    files.push({ blob, name: `foto-${files.length + 1}.${extension}` });
    return { file_index: files.length - 1 };
  });
  const product = { ...input, photos };
  if (files.length === 0) return product;
  const form = new FormData();
  form.append('product', JSON.stringify(product));
  for (const file of files) form.append('photos', file.blob, file.name);
  return form;
}

/**
 * Tambah (productId kosong) atau ubah produk. Error validasi membawa `fieldErrors` di mode mock.
 * @param {number|null} productId
 * @param {object} input — field form produk + photos [{image_id?, image_url}] + variants
 */
export async function saveProduct(productId, input) {
  return apiClient(productId == null ? '/admin/products' : `/admin/products/${productId}`, {
    method: productId == null ? 'POST' : 'PUT',
    // Mode mock: body tetap seperti sebelumnya (data URL disimpan apa adanya oleh mock)
    body: USE_MOCK ? input : toProductRequestBody(input),
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
