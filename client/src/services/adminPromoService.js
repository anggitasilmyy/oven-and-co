// services/adminPromoService.js
// Step 5.8 · FR-34 · UC-29 · BR-09 · BR-10 · AD-09 — voucher & aturan loyalty (Owner, SPEC §2)

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import {
  buildAdminVoucherBoard, saveAdminVoucher, setAdminVoucherActive, buildLoyaltyRules, saveLoyaltyRules,
} from './mock/promoAdmin';
import { ROLES } from '../constants/roles';

const asOwner = (fn) => (...args) => {
  requireMockRole(ROLES.OWNER);
  return fn(...args);
};

/** @returns {Promise<{todayKey, rows, products}>} semua voucher (aktif & nonaktif) */
export function getAdminVouchers() {
  return apiClient('/admin/vouchers', { mockHandler: asOwner(buildAdminVoucherBoard) });
}

/** Tambah (voucherId kosong) atau ubah voucher. Error validasi membawa `fieldErrors` di mode mock. */
export function saveVoucher(voucherId, input) {
  return apiClient(voucherId == null ? '/admin/vouchers' : `/admin/vouchers/${voucherId}`, {
    method: voucherId == null ? 'POST' : 'PUT',
    body: input,
    mockHandler: asOwner(() => saveAdminVoucher(voucherId, input)),
  });
}

/** Aktifkan/nonaktifkan voucher (voucher tidak dihapus karena dirujuk pesanan & voucher pelanggan) */
export function setVoucherActive(voucherId, isActive) {
  return apiClient(`/admin/vouchers/${voucherId}/active`, {
    method: 'PATCH',
    body: { is_active: isActive },
    mockHandler: asOwner(() => setAdminVoucherActive(voucherId, isActive)),
  });
}

/** @returns {Promise<object>} aturan poin & ambang level (store_settings) */
export function getLoyaltyRules() {
  return apiClient('/admin/loyalty', { mockHandler: asOwner(buildLoyaltyRules) });
}

export function updateLoyaltyRules(input) {
  return apiClient('/admin/loyalty', { method: 'PUT', body: input, mockHandler: asOwner(() => saveLoyaltyRules(input)) });
}
