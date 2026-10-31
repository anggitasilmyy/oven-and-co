// services/adminStaff.service.js
// Step 6.4.10 · FR-36 · FR-26 · UC-30 · A-11 · AD-11 tabel "Akun staf" (Owner). Kontrak = client
// services/settingsService.js getAdminAccounts / addAdminAccount / setAdminAccountStatus (mock settingsAdmin.js).
//   C3a GET   /api/admin/staff               → akun Owner & Staf (termasuk nonaktif), urut peran → nama → id
//   C3b POST  /api/admin/staff               → 201 akun baru (Owner atau Staf), bentuk sama dengan GET
//   C3c PATCH /api/admin/staff/:id/active    → adminStaffStatus.service.js
// Keamanan: kolom dipilih eksplisit (select whitelist) — password_hash & google_id tidak pernah dibaca dari database,
// sehingga tidak mungkin ikut terkirim walau pemetaan berubah; akun pelanggan disaring di query (role Owner/Staf saja).
// GET = satu query (keputusan audit C3 D3): tanpa transaksi/snapshot karena tidak ada bagian lain yang harus konsisten.
// POST (keputusan audit C3 D1 & D4):
//   1. validasi isi (aturan registrasi server; pesan & fieldErrors mock) — gagal → 400 tanpa query & tanpa hash;
//   2. cek unik email/HP terhadap SEMUA pengguna (termasuk pelanggan) → 400 fieldErrors.email / phone;
//   3. hash bcrypt cost 12 DI LUAR transaksi/kunci (tidak menahan koneksi DB selama hashing);
//   4. INSERT tunggal tanpa kunci store_settings — pembuatan akun hanya MENAMBAH akun aktif, jadi tidak bisa melanggar
//      invariant "minimal satu Owner aktif". UNIQUE(users.email/phone) = otoritas terakhir: dua request bersamaan yang
//      sama-sama lolos cek awal → yang kalah mendapat P2002 → dipetakan ke fieldErrors HANYA bila constraint-nya email
//      atau phone; P2002 lain (google_id, PRIMARY) tetap error server (500), bukan kesalahan input;
//   5. akun dibaca kembali lewat `select` whitelist yang sama dengan GET.
// Kata sandi asli hanya dipakai untuk hashing: tidak disimpan, tidak dikirim, tidak diteruskan ke Prisma (log error
// Prisma/errorHandler tidak bisa memuatnya). Field di luar kontrak (is_active, google_id, user_id, …) dibuang validator
// zod dan tidak pernah ditulis; akun baru selalu aktif tanpa google_id. Tidak ada hapus akun / ubah peran (keputusan 7).

const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { ADMIN_ACCOUNT_ROLES } = require('../utils/businessConstants');
const {
  normalizeAdminAccount, validateAdminAccount, toAdminAccount, compareAdminAccounts,
} = require('./adminStaffRules.service');

const PASSWORD_HASH_ROUNDS = 12; // sama dengan registrasi pelanggan (auth.service) & ganti sandi (profile.service)

// Constraint UNIQUE users yang boleh dipetakan ke fieldErrors. Prisma MySQL melaporkan nama indeks
// (`users_email_key`); bentuk array nama field juga dikenali. Dicocokkan PERSIS — bukan substring.
const UNIQUE_FIELD_BY_TARGET = Object.freeze({
  users_email_key: 'email', email: 'email',
  users_phone_key: 'phone', phone: 'phone',
});

function httpError(statusCode, message, fieldErrors) {
  return Object.assign(new Error(message), { statusCode }, fieldErrors ? { fieldErrors } : {});
}

// Whitelist kolom users untuk tabel akun admin (bentuk respons = toAdminAccount)
const ADMIN_ACCOUNT_SELECT = Object.freeze({
  userId: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
});

/** GET /api/admin/staff */
async function getAdminAccounts() {
  const rows = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ACCOUNT_ROLES] } },
    select: ADMIN_ACCOUNT_SELECT,
  });
  return rows.map(toAdminAccount).sort(compareAdminAccounts);
}

/** Error validasi isi → 400 dengan pesan pertama + fieldErrors (bentuk mock `invalid(errors)`) */
function assertValid(errors) {
  if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], errors);
}

/** Field (email/phone) dari error P2002; null bila constraint lain atau bukan P2002 */
function uniqueFieldOf(error) {
  if (error?.code !== 'P2002') return null;
  const targets = Array.isArray(error.meta?.target) ? error.meta.target : [error.meta?.target];
  const fields = [...new Set(targets.map((t) => UNIQUE_FIELD_BY_TARGET[String(t)]).filter(Boolean))];
  return fields.length === 1 ? fields[0] : null;
}

/**
 * POST /api/admin/staff
 * @param {object} input — hasil validateStaffBody (name, email, phone, password, role; field lain sudah dibuang)
 * @returns {Promise<object>} akun baru (toAdminAccount)
 */
async function createAdminAccount(input) {
  const account = normalizeAdminAccount(input);
  assertValid(validateAdminAccount(account));

  // Unik terhadap SEMUA pengguna (pelanggan juga); email dibandingkan tanpa beda huruf (collation _ci MySQL)
  const holders = await prisma.user.findMany({
    where: { OR: [{ email: account.email }, { phone: account.phone }] },
    select: { email: true, phone: true },
  });
  assertValid(validateAdminAccount(account, {
    emailTaken: holders.some((u) => u.email.toLowerCase() === account.email),
    phoneTaken: holders.some((u) => u.phone === account.phone),
  }));

  const passwordHash = await bcrypt.hash(account.password, PASSWORD_HASH_ROUNDS);
  try {
    const created = await prisma.user.create({
      data: {
        name: account.name, email: account.email, phone: account.phone, passwordHash, role: account.role, isActive: true,
      },
      select: ADMIN_ACCOUNT_SELECT,
    });
    return toAdminAccount(created);
  } catch (error) {
    const field = uniqueFieldOf(error);
    if (!field) throw error; // constraint lain / error lain → errorHandler (500 umum)
    const errors = validateAdminAccount(account, { emailTaken: field === 'email', phoneTaken: field === 'phone' });
    throw httpError(400, errors[field], { [field]: errors[field] });
  }
}

module.exports = {
  ADMIN_ACCOUNT_SELECT,
  getAdminAccounts,
  createAdminAccount,
};
