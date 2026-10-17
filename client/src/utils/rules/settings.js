// utils/rules/settings.js
// Step 5.8 · FR-36 · UC-30 · BR-05 · BR-12 · TF-10 · AD-11 — pengaturan operasional & akun admin (fungsi murni)
// "Memvalidasi dan menyimpan pengaturan → aturan operasional berlaku di web pelanggan" (FR-36).

import { parseDateKey } from '../date';
import { validateName, validateEmail, validatePhone, validatePassword } from '../authValidation';
import { OPERATING_HOURS_DEFAULT } from '../../constants/storeConfig';
import { ROLES } from '../../constants/roles';
import { PAYMENT_GROUP } from '../../constants/checkout';
import { STORE_FIELD_MAX, MAX_DELIVERY_RADIUS_KM, MAX_DELIVERY_FEE_PER_KM, ADMIN_ACCOUNT_ROLES } from '../../constants/settings';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** operating_hours.day_of_week (1 Senin – 7 Minggu) dari kunci tanggal */
export function dayOfWeekOf(dateKey) {
  return parseDateKey(dateKey).getDay() || 7;
}

/**
 * Jam operasional pada tanggal tertentu. Tabel kosong → asumsi TF-10 (07.00–20.00 setiap hari).
 * @returns {{open_time, close_time, is_open}}
 */
export function getOperatingHoursFor(hours, dateKey) {
  const row = (hours ?? []).find((h) => h.day_of_week === dayOfWeekOf(dateKey));
  if (!row) return { ...OPERATING_HOURS_DEFAULT, is_open: true };
  return { open_time: row.open_time, close_time: row.close_time, is_open: Boolean(row.is_open) };
}

/** Rapikan input profil & operasional toko */
export function normalizeStoreProfile(input = {}) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    store_name: String(input.store_name ?? '').trim(),
    address: String(input.address ?? '').trim(),
    whatsapp_number: String(input.whatsapp_number ?? '').replace(/\s/g, ''),
    preorder_cutoff_time: input.preorder_cutoff_time ?? '',
    delivery_radius_km: num(input.delivery_radius_km),
    delivery_fee_per_km: num(input.delivery_fee_per_km),
  };
}

/** @returns {Record<string,string>} error per field */
export function validateStoreProfile(s) {
  const e = {};
  if (!s.store_name) e.store_name = 'Isi nama toko';
  else if (s.store_name.length > STORE_FIELD_MAX.storeName) e.store_name = `Nama toko maksimal ${STORE_FIELD_MAX.storeName} karakter`;
  if (!s.address) e.address = 'Isi alamat toko (ditampilkan untuk pickup dan struk)';
  else if (s.address.length > STORE_FIELD_MAX.address) e.address = `Alamat maksimal ${STORE_FIELD_MAX.address} karakter`;
  if (!s.whatsapp_number) e.whatsapp_number = 'Isi nomor WhatsApp toko (tombol hubungi toko di tracking)';
  else if (s.whatsapp_number.length > STORE_FIELD_MAX.whatsapp) e.whatsapp_number = `Nomor maksimal ${STORE_FIELD_MAX.whatsapp} karakter`;
  else {
    const phoneError = validatePhone(s.whatsapp_number);
    if (phoneError) e.whatsapp_number = phoneError.replace('Nomor HP', 'Nomor WhatsApp');
  }
  if (!TIME.test(s.preorder_cutoff_time)) e.preorder_cutoff_time = 'Pilih jam batas pre-order';
  if (s.delivery_radius_km == null || Number.isNaN(s.delivery_radius_km) || s.delivery_radius_km <= 0) e.delivery_radius_km = 'Radius harus lebih dari 0 km';
  else if (s.delivery_radius_km > MAX_DELIVERY_RADIUS_KM || Math.round(s.delivery_radius_km * 100) !== s.delivery_radius_km * 100) e.delivery_radius_km = `Radius maks. ${MAX_DELIVERY_RADIUS_KM} km dengan 2 desimal`;
  if (s.delivery_fee_per_km == null || Number.isNaN(s.delivery_fee_per_km) || s.delivery_fee_per_km < 0 || !Number.isInteger(s.delivery_fee_per_km)) e.delivery_fee_per_km = 'Tarif berupa bilangan bulat rupiah ≥ 0';
  else if (s.delivery_fee_per_km > MAX_DELIVERY_FEE_PER_KM) e.delivery_fee_per_km = `Tarif maksimal ${MAX_DELIVERY_FEE_PER_KM.toLocaleString('id-ID')} per km`;
  return e;
}

/**
 * Validasi jam operasional per hari: hari buka wajib punya jam buka < jam tutup; minimal satu hari buka.
 * @param {Array<{day_of_week, open_time, close_time, is_open}>} rows
 * @returns {Record<number,string>} error per day_of_week (+ key 'all')
 */
export function validateOperatingHours(rows) {
  const e = {};
  for (const r of rows) {
    if (!r.is_open) continue;
    if (!TIME.test(r.open_time ?? '') || !TIME.test(r.close_time ?? '')) e[r.day_of_week] = 'Isi jam buka dan jam tutup';
    else if (r.open_time >= r.close_time) e[r.day_of_week] = 'Jam tutup harus setelah jam buka';
  }
  if (!rows.some((r) => r.is_open)) e.all = 'Minimal satu hari toko buka';
  return e;
}

/**
 * Sakelar metode bayar: minimal satu metode online tetap aktif, karena pre-order, custom cake, dan delivery
 * wajib dibayar online (BR-05).
 * @returns {string} pesan error ('' = boleh)
 */
export function validatePaymentMethodToggle(methods, methodCode, isActive) {
  if (isActive) return '';
  const target = methods.find((m) => m.method_code === methodCode);
  if (!target || target.method_group === PAYMENT_GROUP.STORE) return '';
  const otherOnline = methods.filter((m) => m.is_active && m.method_group !== PAYMENT_GROUP.STORE && m.method_code !== methodCode);
  return otherOnline.length ? '' : 'Minimal satu metode bayar online harus aktif (BR-05: pre-order, custom cake, dan delivery wajib online)';
}

/**
 * Validasi akun admin baru (validation rule Registrasi: email valid, HP +62, unik, sandi ≥ 8).
 * @param {{name, email, phone, password, role}} a
 * @param {Array} users — semua pengguna (cek email/HP unik)
 */
export function validateAdminAccount(a, users) {
  const e = {};
  const name = String(a.name ?? '').trim();
  const email = String(a.email ?? '').trim().toLowerCase();
  const phone = String(a.phone ?? '').replace(/\s/g, '');
  const set = (f, msg) => { if (msg) e[f] = msg; };
  set('name', validateName(name) || (name.length > STORE_FIELD_MAX.userName ? `Nama maksimal ${STORE_FIELD_MAX.userName} karakter` : ''));
  set('email', validateEmail(email) || (email.length > STORE_FIELD_MAX.email ? `Email maksimal ${STORE_FIELD_MAX.email} karakter` : '')
    || (users.some((u) => u.email.toLowerCase() === email) ? 'Email sudah terdaftar' : ''));
  set('phone', validatePhone(phone) || (users.some((u) => u.phone.replace(/\s/g, '') === phone) ? 'Nomor HP sudah terdaftar' : ''));
  set('password', validatePassword(a.password ?? ''));
  if (!ADMIN_ACCOUNT_ROLES.includes(a.role)) e.role = 'Pilih peran akun';
  return e;
}

/**
 * Nonaktifkan akun admin: tidak boleh akun sendiri dan harus tersisa minimal satu Owner aktif.
 * @returns {string} pesan error ('' = boleh)
 */
export function validateAdminDeactivation(target, users, currentUserId) {
  if (!target || !ADMIN_ACCOUNT_ROLES.includes(target.role)) return 'Akun admin tidak ditemukan';
  if (target.user_id === currentUserId) return 'Tidak dapat menonaktifkan akun yang sedang dipakai';
  const activeOwners = users.filter((u) => u.role === ROLES.OWNER && u.is_active && u.user_id !== target.user_id);
  if (target.role === ROLES.OWNER && activeOwners.length === 0) return 'Minimal satu akun Owner harus tetap aktif';
  return '';
}
