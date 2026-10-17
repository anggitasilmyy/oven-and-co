// services/mock/settingsAdmin.js
// Step 5.8 · FR-36 · UC-30 · BR-05 · BR-12 · AD-11 — pengaturan toko & akun staf di mode mock
// Pengganti /api/admin/settings & /api/admin/staff (Step 6.4). Nilai yang disimpan langsung berlaku di web
// pelanggan: batas pre-order (C-09/C-11), radius & ongkir (C-13/C-22), jam operasional (slot C-13, BR-07 di C-18),
// metode bayar aktif (C-14), nama/alamat/WhatsApp toko (C-13, C-18, struk AD-04).

import { getTables, updateTable } from './db';
import { getMockUsers, saveMockUsers, addMockUser, sanitizeUser } from './users';
import {
  normalizeStoreProfile, validateStoreProfile, validateOperatingHours, validatePaymentMethodToggle,
  validateAdminAccount, validateAdminDeactivation,
} from '../../utils/businessRules';
import { ADMIN_ACCOUNT_ROLES } from '../../constants/settings';

const fail = (message) => { throw new Error(message); };
const invalid = (errors) => Object.assign(new Error(Object.values(errors)[0]), { fieldErrors: errors });
const PROFILE_FIELDS = ['store_name', 'address', 'whatsapp_number', 'preorder_cutoff_time', 'delivery_radius_km', 'delivery_fee_per_km'];

/** Profil & operasional, jam operasional per hari, dan metode bayar */
export function buildSettingsBoard() {
  const t = getTables('store_settings', 'operating_hours', 'payment_methods');
  return {
    profile: Object.fromEntries(PROFILE_FIELDS.map((f) => [f, t.store_settings[f] ?? null])),
    hours: [...t.operating_hours].sort((a, b) => a.day_of_week - b.day_of_week),
    paymentMethods: t.payment_methods,
  };
}

export function saveStoreProfile(input) {
  const profile = normalizeStoreProfile(input);
  const errors = validateStoreProfile(profile);
  if (Object.keys(errors).length) throw invalid(errors);
  updateTable('store_settings', (s) => ({ ...s, ...profile }));
  return profile;
}

/** Simpan 7 baris jam operasional; hari tutup menyimpan jam null (operating_hours.open_time/close_time nullable) */
export function saveOperatingHours(rows) {
  const { operating_hours: current } = getTables('operating_hours');
  const next = current.map((h) => {
    const row = rows.find((r) => Number(r.day_of_week) === h.day_of_week) ?? h;
    const isOpen = Boolean(row.is_open);
    return { ...h, is_open: isOpen, open_time: isOpen ? row.open_time : null, close_time: isOpen ? row.close_time : null };
  });
  const errors = validateOperatingHours(next);
  if (Object.keys(errors).length) throw invalid(errors);
  updateTable('operating_hours', () => next);
  return next;
}

export function setPaymentMethodActive(methodCode, isActive) {
  const { payment_methods: methods } = getTables('payment_methods');
  if (!methods.some((m) => m.method_code === methodCode)) fail('Metode bayar tidak ditemukan');
  const error = validatePaymentMethodToggle(methods, methodCode, isActive);
  if (error) fail(error);
  updateTable('payment_methods', (rows) => rows.map((m) => (m.method_code === methodCode ? { ...m, is_active: Boolean(isActive) } : m)));
  return { method_code: methodCode, is_active: Boolean(isActive) };
}

/** Akun admin (Owner & Staf) tanpa kata sandi */
export function buildAdminAccounts() {
  return getMockUsers()
    .filter((u) => ADMIN_ACCOUNT_ROLES.includes(u.role))
    .map(sanitizeUser)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

/** Tambah akun Staf/Owner baru (validation rule Registrasi) */
export function createAdminAccount(input) {
  const errors = validateAdminAccount(input, getMockUsers());
  if (Object.keys(errors).length) throw invalid(errors);
  const user = addMockUser({
    name: String(input.name).trim(), email: String(input.email).trim().toLowerCase(),
    phone: String(input.phone).replace(/\s/g, ''), password: input.password, role: input.role,
  });
  return sanitizeUser(user);
}

/** Nonaktifkan / aktifkan kembali akun admin (akun nonaktif tidak bisa login — authService) */
export function setAdminAccountActive(userId, isActive, currentUserId) {
  const users = getMockUsers();
  const target = users.find((u) => u.user_id === Number(userId) && ADMIN_ACCOUNT_ROLES.includes(u.role)) ?? fail('Akun admin tidak ditemukan');
  if (!isActive) {
    const error = validateAdminDeactivation(target, users, currentUserId);
    if (error) fail(error);
  }
  saveMockUsers(users.map((u) => (u.user_id === target.user_id ? { ...u, is_active: Boolean(isActive) } : u)));
  return sanitizeUser({ ...target, is_active: Boolean(isActive) });
}
