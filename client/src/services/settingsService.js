// services/settingsService.js
// Step 5.8 · FR-36 · UC-30 · AD-11 — pengaturan operasional toko & akun staf (Owner, SPEC §2)

import { apiClient } from './apiClient';
import { requireMockRole } from './mock/mockSession';
import {
  buildSettingsBoard, saveStoreProfile, saveOperatingHours, setPaymentMethodActive as setMethodActive,
  buildAdminAccounts, createAdminAccount, setAdminAccountActive,
} from './mock/settingsAdmin';
import { ROLES } from '../constants/roles';

const asOwner = (fn) => (...args) => fn(requireMockRole(ROLES.OWNER), ...args);

/** @returns {Promise<{profile, hours, paymentMethods}>} */
export function getStoreSettings() {
  return apiClient('/admin/settings', { mockHandler: asOwner(() => buildSettingsBoard()) });
}

/** Profil toko, batas pre-order, radius & tarif ongkir */
export function updateStoreProfile(input) {
  return apiClient('/admin/settings', { method: 'PUT', body: input, mockHandler: asOwner(() => saveStoreProfile(input)) });
}

/** @param {Array<{day_of_week, open_time, close_time, is_open}>} rows */
export function updateOperatingHours(rows) {
  return apiClient('/admin/settings/operating-hours', {
    method: 'PUT', body: { hours: rows }, mockHandler: asOwner(() => saveOperatingHours(rows)),
  });
}

export function setPaymentMethodActive(methodCode, isActive) {
  return apiClient(`/admin/payment-methods/${methodCode}/active`, {
    method: 'PATCH', body: { is_active: isActive }, mockHandler: asOwner(() => setMethodActive(methodCode, isActive)),
  });
}

/** @returns {Promise<Array>} akun Owner & Staf */
export function getAdminAccounts() {
  return apiClient('/admin/staff', { mockHandler: asOwner(() => buildAdminAccounts()) });
}

export function addAdminAccount(input) {
  return apiClient('/admin/staff', { method: 'POST', body: input, mockHandler: asOwner(() => createAdminAccount(input)) });
}

/** Nonaktifkan / aktifkan akun (Owner tidak bisa menonaktifkan akunnya sendiri) */
export function setAdminAccountStatus(userId, isActive) {
  return apiClient(`/admin/staff/${userId}/active`, {
    method: 'PATCH',
    body: { is_active: isActive },
    mockHandler: asOwner((owner) => setAdminAccountActive(userId, isActive, owner.user_id)),
  });
}
