// services/profile.service.js
// FR-24 · UC-16 · C-20 Ubah Profil — profil & kata sandi pelanggan login.
// Respons profil = publicUser (bentuk yang sama dengan login/registrasi) karena frontend mengganti user sesi
// (useAuthStore.updateCurrentUser) dengan respons ini. password_hash tidak pernah dikirim.
// userId SELALU dari req.user (middleware auth), tidak pernah dari body/URL.

const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { publicUser } = require('./auth.service');

// Cost bcrypt sama dengan registrasi & reset kata sandi (auth.service)
const PASSWORD_HASH_ROUNDS = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt hanya memproses 72 byte pertama

const WRONG_PASSWORD_MESSAGE = 'Kata sandi saat ini salah.';

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const PROFILE_SELECT = {
  userId: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true,
};

/** GET /api/me/profile */
async function getMyProfile(userId) {
  const user = await prisma.user.findUnique({ where: { userId: BigInt(userId) }, select: PROFILE_SELECT });

  if (!user) throw httpError(404, 'Akun tidak ditemukan.');
  return publicUser(user);
}

/** PATCH|PUT /api/me/profile — hanya nama, email, HP; email & HP harus unik (pesan sama dengan mock) */
async function updateMyProfile(userId, input) {
  const id = BigInt(userId);

  const taken = await prisma.user.findMany({
    where: { userId: { not: id }, OR: [{ email: input.email }, { phone: input.phone }] },
    select: { email: true, phone: true },
  });

  if (taken.some((user) => user.email.toLowerCase() === input.email)) {
    throw httpError(409, 'Email sudah terdaftar.');
  }
  if (taken.length > 0) {
    throw httpError(409, 'Nomor HP sudah terdaftar.');
  }

  try {
    const user = await prisma.user.update({
      where: { userId: id },
      data: { name: input.name, email: input.email, phone: input.phone },
      select: PROFILE_SELECT,
    });
    return publicUser(user);
  } catch (error) {
    // Dua akun mengubah ke email/HP yang sama bersamaan → unique index menolak
    if (error.code === 'P2002') throw httpError(409, 'Email atau nomor HP sudah terdaftar.');
    if (error.code === 'P2025') throw httpError(404, 'Akun tidak ditemukan.');
    throw error;
  }
}

/**
 * PATCH|PUT /api/me/password — kata sandi saat ini wajib benar. Akun tanpa kata sandi (hanya Google) memakai pesan
 * yang sama. Hash diganti hanya bila masih sama dengan hash yang diverifikasi (perubahan bersamaan tidak saling timpa).
 */
async function changeMyPassword(userId, { currentPassword, newPassword }) {
  const id = BigInt(userId);
  const user = await prisma.user.findUnique({ where: { userId: id }, select: { passwordHash: true } });

  // > 72 byte tidak pernah bisa menjadi kata sandi akun (ditolak saat dibuat); jangan biarkan bcrypt memotongnya
  const verified =
    Boolean(user?.passwordHash) &&
    Buffer.byteLength(currentPassword, 'utf8') <= MAX_PASSWORD_BYTES &&
    (await bcrypt.compare(currentPassword, user.passwordHash));

  if (!verified) throw httpError(400, WRONG_PASSWORD_MESSAGE);

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
  const result = await prisma.user.updateMany({
    where: { userId: id, passwordHash: user.passwordHash },
    data: { passwordHash },
  });

  if (result.count !== 1) throw httpError(400, WRONG_PASSWORD_MESSAGE);

  return { message: 'Kata sandi berhasil diubah.' };
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
};
