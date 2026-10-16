// services/authService.js
// Step 3 · Authentication
// FR-01 · FR-02 · FR-03 · FR-26
// Semua operasi auth — mode mock dan API

import { apiClient } from './apiClient';
import {
  findUserByIdentifier,
  addMockUser,
  sanitizeUser,
  getMockUsers,
  saveMockUsers,
} from './mock/users';

// ── Konstanta OTP Mock ────────────────────────────────────────────────────────
const OTP_KEY_PREFIX = 'ovenco_mock_otp_';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 menit

// ── Helpers OTP ──────────────────────────────────────────────────────────────

/** Buat OTP 6 digit, simpan ke localStorage, cetak ke console (mode mock). */
function generateAndStoreOtp(email) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const record = { otp, expires_at: Date.now() + OTP_TTL_MS, used: false };
  localStorage.setItem(OTP_KEY_PREFIX + email.toLowerCase(), JSON.stringify(record));
  // Sesuai SPEC §10: OTP dicetak ke console (mode mock/development)
  console.log(`[Oven & Co. Mock OTP] Email: ${email} → Kode OTP: ${otp}`);
  return otp;
}

/** Verifikasi OTP — kembalikan true jika valid & belum dipakai. */
function verifyOtp(email, inputOtp) {
  const raw = localStorage.getItem(OTP_KEY_PREFIX + email.toLowerCase());
  if (!raw) return false;
  try {
    const record = JSON.parse(raw);
    if (record.used) return false;
    if (Date.now() > record.expires_at) return false;
    return record.otp === String(inputOtp).trim();
  } catch {
    return false;
  }
}

/** Tandai OTP sebagai sudah dipakai. */
function markOtpUsed(email) {
  const raw = localStorage.getItem(OTP_KEY_PREFIX + email.toLowerCase());
  if (!raw) return;
  try {
    const record = JSON.parse(raw);
    record.used = true;
    localStorage.setItem(OTP_KEY_PREFIX + email.toLowerCase(), JSON.stringify(record));
  } catch {
    /* abaikan */
  }
}

// ── Mock Handlers ─────────────────────────────────────────────────────────────

async function mockLogin({ identifier, password }) {
  const user = findUserByIdentifier(identifier);
  // Pesan error persis sesuai SPEC §6 validation rules
  if (!user || user.password !== password) {
    throw new Error('Email/HP atau kata sandi salah');
  }
  if (!user.is_active) {
    throw new Error('Akun tidak aktif. Hubungi toko.');
  }
  return {
    user: sanitizeUser(user),
    token: `mock_token_${user.user_id}_${Date.now()}`,
  };
}

async function mockRegister({ name, email, phone, password }) {
  // Validasi unikness
  const users = getMockUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email sudah terdaftar');
  }
  if (users.find((u) => u.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''))) {
    throw new Error('Nomor HP sudah terdaftar');
  }
  const newUser = addMockUser({ name, email, phone, password, role: 'customer' });
  return {
    user: sanitizeUser(newUser),
    token: `mock_token_${newUser.user_id}_${Date.now()}`,
  };
}

async function mockRequestOtp({ email }) {
  const users = getMockUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Email tidak ditemukan');
  generateAndStoreOtp(email);
  return { message: 'OTP dikirim ke email' };
}

async function mockVerifyOtpAndReset({ email, otp, newPassword }) {
  const valid = verifyOtp(email, otp);
  if (!valid) throw new Error('OTP tidak valid atau sudah kedaluwarsa');
  // Update password
  const users = getMockUsers();
  const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) throw new Error('Pengguna tidak ditemukan');
  users[idx].password = newPassword;
  saveMockUsers(users);
  markOtpUsed(email);
  return { message: 'Kata sandi berhasil diubah' };
}

/** Login Google mock — masuk sebagai akun pelanggan demo */
async function mockGoogleLogin() {
  const user = findUserByIdentifier('pelanggan@demo.com');
  if (!user) throw new Error('Akun demo tidak ditemukan');
  return {
    user: sanitizeUser(user),
    token: `mock_token_google_${user.user_id}_${Date.now()}`,
  };
}

// ── Auth Service (ekspor publik) ──────────────────────────────────────────────

/**
 * Login dengan email/HP + sandi.
 * @param {string} identifier - email atau nomor HP
 * @param {string} password
 * @returns {Promise<{user, token}>}
 */
export async function login(identifier, password) {
  return apiClient('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    mockHandler: () => mockLogin({ identifier, password }),
  });
}

/**
 * Login dengan Google (mock: masuk sebagai pelanggan demo).
 * @returns {Promise<{user, token}>}
 */
export async function loginWithGoogle() {
  return apiClient('/auth/google', {
    method: 'POST',
    mockHandler: () => mockGoogleLogin(),
  });
}

/**
 * Daftarkan akun pelanggan baru.
 * @param {{name, email, phone, password}} data
 * @returns {Promise<{user, token}>}
 */
export async function register(data) {
  return apiClient('/auth/register', {
    method: 'POST',
    body: data,
    mockHandler: () => mockRegister(data),
  });
}

/**
 * Minta OTP reset sandi — OTP dicetak ke console di mode mock.
 * @param {string} email
 * @returns {Promise<{message}>}
 */
export async function requestOtp(email) {
  return apiClient('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    mockHandler: () => mockRequestOtp({ email }),
  });
}

/**
 * Verifikasi OTP dan simpan sandi baru.
 * @param {{email, otp, newPassword}} data
 * @returns {Promise<{message}>}
 */
export async function verifyOtpAndReset(data) {
  return apiClient('/auth/reset-password', {
    method: 'POST',
    body: data,
    mockHandler: () => mockVerifyOtpAndReset(data),
  });
}
