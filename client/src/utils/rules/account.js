// utils/rules/account.js
// Step 5.5 · FR-22 – FR-25 · BR-09 · BR-12 · C-20 – C-22 — profil, alamat, voucher & riwayat poin (fungsi murni).

import { validateEmail, validateName, validatePhone } from '../authValidation';
import { isVoucherActiveOn } from './promo';
import { ADDRESS_LIMITS, PROFILE_NAME_MAX, KM_PER_DEGREE, VOUCHER_STATE } from '../../constants/account';

const tooLong = (val, max, field) => (String(val ?? '').trim().length > max ? `${field} maksimal ${max} karakter` : '');

/**
 * Validasi Ubah Profil (aturan sama dengan Registrasi SPEC §6: email valid, HP diawali +62).
 * Keunikan email/HP diperiksa service karena butuh data pengguna lain.
 * @returns {Record<string, string>} pesan error per field (kosong = valid)
 */
export function validateProfileInput({ name = '', email = '', phone = '' }) {
  const errors = {
    name: validateName(name) || tooLong(name, PROFILE_NAME_MAX, 'Nama'),
    email: validateEmail(email),
    phone: validatePhone(phone),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}

/**
 * Validasi form alamat (kolom wajib addresses SPEC §8). Koordinat wajib karena ongkir dihitung dari jarak (BR-12).
 * @returns {Record<string, string>}
 */
export function validateAddressInput(input) {
  const required = (val, msg) => (String(val ?? '').trim() ? '' : msg);
  const hasPin = [input.latitude, input.longitude].every((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  const errors = {
    label: required(input.label, 'Label alamat wajib diisi') || tooLong(input.label, ADDRESS_LIMITS.label, 'Label'),
    recipient_name: required(input.recipient_name, 'Nama penerima wajib diisi')
      || tooLong(input.recipient_name, ADDRESS_LIMITS.recipient_name, 'Nama penerima'),
    recipient_phone: validatePhone(String(input.recipient_phone ?? ''))
      || tooLong(input.recipient_phone, ADDRESS_LIMITS.recipient_phone, 'Nomor HP'),
    full_address: required(input.full_address, 'Alamat lengkap wajib diisi'),
    pin: hasPin ? '' : 'Tentukan titik lokasi di peta',
    courier_note: tooLong(input.courier_note, ADDRESS_LIMITS.courier_note, 'Catatan kurir'),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}

/**
 * Satu alamat utama per pelanggan: alamat `primaryId` menjadi utama, alamat lain pelanggan itu tidak.
 * Bila pelanggan tidak punya alamat utama (mis. alamat utama dihapus), alamat pertamanya menjadi utama.
 * @param {Array} rows — semua addresses
 * @param {number} userId
 * @param {number|null} [primaryId]
 * @returns {Array} rows baru
 */
export function normalizePrimaryAddress(rows, userId, primaryId = null) {
  const mine = rows.filter((a) => a.user_id === userId);
  const target = primaryId ?? mine.find((a) => a.is_primary)?.address_id ?? mine[0]?.address_id ?? null;
  return rows.map((a) => (a.user_id === userId ? { ...a, is_primary: a.address_id === target } : a));
}

/** Pin peta simulasi: offset km dari toko → koordinat (7 desimal, DECIMAL(10,7)) */
export function offsetToCoordinates(store, northKm, eastKm) {
  const round = (n) => Math.round(n * 1e7) / 1e7;
  return {
    latitude: round(Number(store.latitude) + northKm / KM_PER_DEGREE),
    longitude: round(Number(store.longitude) + eastKm / KM_PER_DEGREE),
  };
}

/** Kebalikan offsetToCoordinates — posisi pin di peta simulasi */
export function coordinatesToOffset(store, point) {
  return {
    northKm: (Number(point.latitude) - Number(store.latitude)) * KM_PER_DEGREE,
    eastKm: (Number(point.longitude) - Number(store.longitude)) * KM_PER_DEGREE,
  };
}

/**
 * Status voucher milik pelanggan (FR-23): sudah dipakai, masih bisa dipakai, atau tidak berlaku lagi.
 * @param {{used_at}} claim — user_vouchers
 * @param {object} voucher — vouchers
 * @param {string} todayKey
 */
export function getVoucherState(claim, voucher, todayKey) {
  if (claim.used_at) return VOUCHER_STATE.USED;
  return isVoucherActiveOn(voucher, todayKey) ? VOUCHER_STATE.USABLE : VOUCHER_STATE.EXPIRED;
}

/** Urutan voucher C-21: bisa dipakai → sudah dipakai → tidak berlaku; di dalamnya yang paling cepat berakhir dulu */
export function sortVouchersForDisplay(list) {
  const rank = { [VOUCHER_STATE.USABLE]: 0, [VOUCHER_STATE.USED]: 1, [VOUCHER_STATE.EXPIRED]: 2 };
  return [...list].sort((a, b) => rank[a.state] - rank[b.state] || a.voucher.valid_to.localeCompare(b.voucher.valid_to));
}
