const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomInt } = require('crypto');
const prisma = require('../lib/prisma');

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[\s()-]/g, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw createError(
      'Kata sandi harus minimal 8 karakter.',
      400
    );
  }

  // bcrypt hanya memproses maksimal 72 byte.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw createError(
      'Kata sandi terlalu panjang.',
      400
    );
  }
}

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw createError(
      'Konfigurasi JWT_SECRET belum tersedia.',
      500
    );
  }

  return jwt.sign(
    { role: user.role },
    secret,
    {
      subject: String(user.userId),
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );
}

function publicUser(user) {
  return {
    userId: String(user.userId),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

async function register(input) {
  const name =
    typeof input.name === 'string' ? input.name.trim() : '';

  const email =
    typeof input.email === 'string'
      ? input.email.trim().toLowerCase()
      : '';

  const phone = normalizePhone(input.phone);
  const password = input.password;

  if (!name || name.length > 100) {
    throw createError(
      'Nama wajib diisi dan maksimal 100 karakter.',
      400
    );
  }

  if (
    !email ||
    email.length > 150 ||
    !isValidEmail(email)
  ) {
    throw createError('Format email tidak valid.', 400);
  }

  if (!/^\+62\d{8,13}$/.test(phone)) {
    throw createError(
      'Nomor HP harus menggunakan format +62.',
      400
    );
  }

  validatePassword(password);

  if (input.termsAccepted !== true) {
    throw createError(
      'Persetujuan syarat dan ketentuan wajib dicentang.',
      400
    );
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { phone }],
    },
    select: {
      userId: true,
    },
  });

  if (existingUser) {
    throw createError(
      'Email atau nomor HP sudah terdaftar.',
      409
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user;

  try {
    user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: 'customer',
      },
    });
  } catch (error) {
    // Tetap menangani kemungkinan dua registrasi bersamaan.
    if (error.code === 'P2002') {
      throw createError(
        'Email atau nomor HP sudah terdaftar.',
        409
      );
    }

    throw error;
  }

  return {
    user: publicUser(user),
    token: createToken(user),
  };
}

async function login(input) {
  const identifier = String(
    input.identifier ||
    input.emailOrPhone ||
    input.email ||
    input.phone ||
    ''
  ).trim();

  const password = input.password;

  if (!identifier || typeof password !== 'string') {
    throw createError(
      'Email/HP dan kata sandi wajib diisi.',
      400
    );
  }

  const user = identifier.includes('@')
    ? await prisma.user.findUnique({
        where: {
          email: identifier.toLowerCase(),
        },
      })
    : await prisma.user.findUnique({
        where: {
          phone: normalizePhone(identifier),
        },
      });

  if (
    !user ||
    !user.passwordHash ||
    !user.isActive ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    throw createError(
      'Email/HP atau kata sandi salah.',
      401
    );
  }

  return {
    user: publicUser(user),
    token: createToken(user),
  };
}

async function requestPasswordReset(input) {
  const email =
    typeof input.email === 'string'
      ? input.email.trim().toLowerCase()
      : '';

  if (!isValidEmail(email)) {
    throw createError('Format email tidak valid.', 400);
  }

  // Belum ada penyedia email untuk produksi.
  // Jangan mencetak OTP ke console produksi.
  if (process.env.NODE_ENV === 'production') {
    throw createError(
      'Layanan reset kata sandi belum dikonfigurasi.',
      503
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
    },
  });

  // Pesan tetap sama agar keberadaan email tidak bocor.
  const genericMessage =
    'Jika email terdaftar, OTP reset kata sandi akan ditampilkan di console server.';

  if (!user) {
    return { message: genericMessage };
  }

  const otp = String(randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // OTP sebelumnya yang belum digunakan menjadi tidak berlaku.
    await tx.passwordReset.updateMany({
      where: {
        userId: user.userId,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    await tx.passwordReset.create({
      data: {
        userId: user.userId,
        otpHash,
        expiresAt,
      },
    });
  });

  console.info(
    `[DEV OTP] Reset password untuk ${user.email}: ${otp} (berlaku 10 menit)`
  );

  return { message: genericMessage };
}

async function resetPassword(input) {
  const email =
    typeof input.email === 'string'
      ? input.email.trim().toLowerCase()
      : '';

  const otp = String(input.otp || '');
  const newPassword = input.newPassword;

  if (!isValidEmail(email)) {
    throw createError('Format email tidak valid.', 400);
  }

  if (!/^\d{6}$/.test(otp)) {
    throw createError('OTP harus terdiri dari 6 digit.', 400);
  }

  validatePassword(newPassword);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { userId: true },
  });

  if (!user) {
    throw createError(
      'OTP tidak valid, kedaluwarsa, atau sudah digunakan.',
      400
    );
  }

  const now = new Date();

  const resetRecords = await prisma.passwordReset.findMany({
    where: {
      userId: user.userId,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: {
      expiresAt: 'desc',
    },
  });

  let matchedReset = null;

  for (const record of resetRecords) {
    if (await bcrypt.compare(otp, record.otpHash)) {
      matchedReset = record;
      break;
    }
  }

  if (!matchedReset) {
    throw createError(
      'OTP tidak valid, kedaluwarsa, atau sudah digunakan.',
      400
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Mengklaim OTP secara atomik agar tidak dapat digunakan dua kali.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordReset.updateMany({
      where: {
        resetId: matchedReset.resetId,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    if (claimed.count !== 1) {
      throw createError(
        'OTP tidak valid, kedaluwarsa, atau sudah digunakan.',
        400
      );
    }

    // Semua OTP lain yang masih aktif ikut dinonaktifkan.
    await tx.passwordReset.updateMany({
      where: {
        userId: user.userId,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    await tx.user.update({
      where: {
        userId: user.userId,
      },
      data: {
        passwordHash,
      },
    });
  });

  return {
    message: 'Kata sandi berhasil diubah.',
  };
}

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
};