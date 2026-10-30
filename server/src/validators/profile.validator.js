// validators/profile.validator.js
// FR-24 · UC-16 · C-20 Ubah Profil — validasi /api/me/profile & /api/me/password dengan zod.
// Aturan SAMA dengan registrasi server (auth.service): nama 1–100, email valid ≤ 150 (huruf kecil),
// HP +62 diikuti 8–13 digit (spasi/()/- dihapus), kata sandi ≥ 8 karakter & ≤ 72 byte (batas bcrypt).
// Hanya field form yang diambil: role, is_active, user_id, password_hash, dll. dibuang.

const { normalizePhone, isValidEmail, validatePassword } = require('../services/auth.service');
const { z, parseOrThrow } = require('./zodHelpers');

const NAME_MAX = 100; // users.name VARCHAR(100)
const EMAIL_MAX = 150; // users.email VARCHAR(150)
const PHONE_PATTERN = /^\+62\d{8,13}$/; // sama dengan auth.service register

const name = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .string({ error: 'Nama wajib diisi.' })
    .min(1, { error: 'Nama wajib diisi.' })
    .max(NAME_MAX, { error: `Nama maksimal ${NAME_MAX} karakter.` })
);

const email = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z
    .string({ error: 'Email wajib diisi.' })
    .min(1, { error: 'Email wajib diisi.' })
    .max(EMAIL_MAX, { error: 'Format email tidak valid.' })
    .refine(isValidEmail, { error: 'Format email tidak valid.' })
);

const phone = z.preprocess(
  (value) => (typeof value === 'string' ? normalizePhone(value) : value),
  z
    .string({ error: 'Nomor HP wajib diisi.' })
    .min(1, { error: 'Nomor HP wajib diisi.' })
    .refine((value) => PHONE_PATTERN.test(value), { error: 'Nomor HP harus menggunakan format +62.' })
);

const profileSchema = z.object({ name, email, phone }, { error: 'Data profil tidak valid.' });

const passwordSchema = z.object(
  {
    currentPassword: z.string({ error: 'Kata sandi saat ini wajib diisi.' }).min(1, { error: 'Kata sandi saat ini wajib diisi.' }),
    newPassword: z.string({ error: 'Kata sandi harus minimal 8 karakter.' }),
  },
  { error: 'Data kata sandi tidak valid.' }
);

/** @returns {{name: string, email: string, phone: string}} */
function validateProfileBody(body) {
  return parseOrThrow(profileSchema, body ?? {});
}

/** @returns {{currentPassword: string, newPassword: string}} — kata sandi TIDAK di-trim */
function validatePasswordBody(body) {
  const input = parseOrThrow(passwordSchema, body ?? {});

  validatePassword(input.newPassword);

  if (input.newPassword === input.currentPassword) {
    throw Object.assign(new Error('Kata sandi baru harus berbeda dari kata sandi saat ini.'), { statusCode: 400 });
  }

  return input;
}

module.exports = {
  validateProfileBody,
  validatePasswordBody,
};
