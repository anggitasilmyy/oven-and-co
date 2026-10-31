// services/adminStaffRules.service.js
// Step 6.4.10 · FR-36 · FR-26 · UC-30 · AD-11 tabel "Akun staf" — aturan murni akun admin (Owner & Staf).
// Port dari client utils/rules/settings.js validateAdminAccount / validateAdminDeactivation (pesan & fieldErrors mock).
// Keputusan audit AD-11:
//   - HP akun mengikuti aturan REGISTRASI server (auth.service: spasi ( ) - dihapus, +62 lalu 8–13 digit) agar akun
//     bisa masuk dengan nomor yang sama; pesan memakai teks mock. Kata sandi juga dibatasi 72 byte (batas bcrypt).
//   - Email/HP unik terhadap SEMUA pengguna (UNIQUE users.email/phone), bukan hanya akun admin seperti form mock.
//   - Owner boleh membuat akun Owner atau Staf; tidak ada hapus akun dan ubah peran.
//   - Status: akun sendiri → 400, Owner aktif terakhir → 409, bukan akun admin / tidak ada → 404; tanpa perubahan → null.
// Respons akun = whitelist (tanpa password_hash, google_id).

const { ADMIN_ACCOUNT_ROLES, OWNER_ROLE, STORE_FIELD_MAX } = require('../utils/businessConstants');
const { normalizePhone, isValidEmail } = require('./auth.service');

const PASSWORD_MIN_LENGTH = 8; // SPEC §10 (TF-15)
const PASSWORD_MAX_BYTES = 72; // bcrypt
const REGISTER_PHONE = /^\+62\d{8,13}$/; // sama dengan auth.service register

const MESSAGES = Object.freeze({
  NOT_FOUND: 'Akun admin tidak ditemukan',
  SELF: 'Tidak dapat menonaktifkan akun yang sedang dipakai',
  LAST_OWNER: 'Minimal satu akun Owner harus tetap aktif',
});

/** Rapikan input form akun (email huruf kecil; HP dinormalisasi seperti registrasi/login) */
function normalizeAdminAccount(input = {}) {
  return {
    name: String(input.name ?? '').trim(),
    email: String(input.email ?? '').trim().toLowerCase(),
    phone: normalizePhone(input.phone ?? ''),
    password: typeof input.password === 'string' ? input.password : '',
    role: input.role ?? '',
  };
}

function phoneError(phone) {
  if (!phone) return 'Nomor HP wajib diisi';
  if (!phone.startsWith('+62')) return 'Nomor HP harus diawali +62';
  return REGISTER_PHONE.test(phone) ? '' : 'Nomor HP tidak valid';
}

function passwordError(password) {
  if (!password) return 'Kata sandi wajib diisi';
  if (password.length < PASSWORD_MIN_LENGTH) return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter`;
  return Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES ? 'Kata sandi terlalu panjang' : '';
}

/**
 * @param {object} a — hasil normalizeAdminAccount
 * @param {{emailTaken?: boolean, phoneTaken?: boolean}} ctx — hasil cek basis data (semua pengguna)
 * @returns {Record<string,string>} error per field (kosong = sah)
 */
function validateAdminAccount(a, { emailTaken = false, phoneTaken = false } = {}) {
  const e = {};
  const set = (field, message) => { if (message) e[field] = message; };
  set('name', !a.name ? 'Nama wajib diisi' : a.name.length > STORE_FIELD_MAX.userName ? `Nama maksimal ${STORE_FIELD_MAX.userName} karakter` : '');
  set('email', (!a.email && 'Email wajib diisi') || (!isValidEmail(a.email) && 'Format email tidak valid')
    || (a.email.length > STORE_FIELD_MAX.email && `Email maksimal ${STORE_FIELD_MAX.email} karakter`)
    || (emailTaken && 'Email sudah terdaftar') || '');
  set('phone', phoneError(a.phone) || (phoneTaken ? 'Nomor HP sudah terdaftar' : ''));
  set('password', passwordError(a.password));
  if (!ADMIN_ACCOUNT_ROLES.includes(a.role)) e.role = 'Pilih peran akun';
  return e;
}

/**
 * Aktifkan / nonaktifkan akun admin.
 * @param {{user_id, role, is_active}|null} target — dibaca setelah kunci (C3)
 * @param {boolean} isActive — status tujuan
 * @param {{currentUserId: string, activeOwnerIds: string[]}} ctx — semua Owner aktif saat ini
 * @returns {{statusCode: number, message: string}|null} null = boleh / tanpa perubahan
 */
function adminAccountStatusError(target, isActive, { currentUserId, activeOwnerIds = [] }) {
  if (!target || !ADMIN_ACCOUNT_ROLES.includes(target.role)) return { statusCode: 404, message: MESSAGES.NOT_FOUND };
  if (isActive) return null;
  const targetId = String(target.user_id);
  if (targetId === String(currentUserId)) return { statusCode: 400, message: MESSAGES.SELF };
  if (!target.is_active) return null; // sudah nonaktif → idempoten
  const otherOwners = activeOwnerIds.map(String).filter((id) => id !== targetId);
  if (target.role === OWNER_ROLE && otherOwners.length === 0) return { statusCode: 409, message: MESSAGES.LAST_OWNER };
  return null;
}

/** Baris users → akun admin (whitelist; tanpa password_hash / google_id) */
const toAdminAccount = (row) => ({
  user_id: String(row.userId),
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  is_active: row.isActive,
  created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
});

/** Urutan tabel mock: peran (owner sebelum staf), nama, lalu id */
function compareAdminAccounts(a, b) {
  return a.role.localeCompare(b.role) || a.name.localeCompare(b.name)
    || (BigInt(a.user_id) < BigInt(b.user_id) ? -1 : BigInt(a.user_id) > BigInt(b.user_id) ? 1 : 0);
}

module.exports = {
  normalizeAdminAccount,
  validateAdminAccount,
  adminAccountStatusError,
  toAdminAccount,
  compareAdminAccounts,
  STAFF_MESSAGES: MESSAGES,
};
