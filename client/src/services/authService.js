// services/authService.js
// Step 3 · Authentication
// FR-01 · FR-02 · FR-03 · FR-26
// Step 6.6 (CP2c): Google hanya di mode mock; petunjuk OTP per mode. (CP2d): pesan mock = pesan API (tanpa membuka
// keberadaan email / status akun).
// Semua operasi auth — mode mock dan API

import { apiClient, USE_MOCK } from './apiClient';
import {
  GOOGLE_LOGIN_UNAVAILABLE_MESSAGE, GOOGLE_LOGIN_UNAVAILABLE_CODE, OTP_DELIVERY_HINT, AUTH_MESSAGE, OTP_VALID_MINUTES,
} from '../constants/auth';
import { validateEmail } from '../utils/authValidation';
import {
  findUserByIdentifier,
  addMockUser,
  sanitizeUser,
  getMockUsers,
  saveMockUsers,
} from './mock/users';

// ── Konstanta OTP Mock ────────────────────────────────────────────────────────
const OTP_KEY_PREFIX = 'ovenco_mock_otp_';
// Step 6.6 (CP2): sama dengan server — 10 menit (sebelumnya 5 menit di mock)
const OTP_TTL_MS = OTP_VALID_MINUTES * 60 * 1000;

// ── Helpers OTP ──────────────────────────────────────────────────────────────

/**
 * Buat OTP 6 digit, simpan ke localStorage, cetak ke console (mode mock). Satu record per email: permintaan baru
 * menggantikan OTP lama yang belum dipakai (sama dengan server yang menonaktifkan OTP aktif sebelumnya).
 */
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
    // Step 6.6 (CP2): semantik server `expiresAt > now` — tepat di waktu kedaluwarsa sudah ditolak
    if (Date.now() >= record.expires_at) return false;
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
  // SPEC §6 · Step 6.6 (CP2d): satu pesan untuk akun tidak ada, sandi salah, dan akun nonaktif (sama dengan API)
  if (!user || user.password !== password || !user.is_active) {
    throw new Error(AUTH_MESSAGE.LOGIN_FAILED);
  }
  return {
    user: sanitizeUser(user),
    token: `mock_token_${user.user_id}_${Date.now()}`,
  };
}

async function mockRegister({ name, email, phone, password }) {
  // Validasi unikness
  const users = getMockUsers();
  // Step 6.6 (CP2d): pesan sama dengan API (409) — tidak membedakan email atau HP yang sudah dipakai
  if (
    users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    || users.find((u) => u.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''))
  ) {
    throw new Error(AUTH_MESSAGE.ALREADY_REGISTERED);
  }
  const newUser = addMockUser({ name, email, phone, password, role: 'customer' });
  return {
    user: sanitizeUser(newUser),
    token: `mock_token_${newUser.user_id}_${Date.now()}`,
  };
}

async function mockRequestOtp({ email }) {
  // Step 6.6 (CP2d): sama dengan API — format email diperiksa, lalu pesan yang sama terdaftar atau tidak
  if (validateEmail(String(email ?? ''))) throw new Error(AUTH_MESSAGE.INVALID_EMAIL);
  const users = getMockUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (user) generateAndStoreOtp(user.email);
  return { message: AUTH_MESSAGE.OTP_REQUESTED_MOCK };
}

async function mockVerifyOtpAndReset({ email, otp, newPassword }) {
  // Step 6.6 (CP2d): satu pesan untuk OTP salah/kedaluwarsa/terpakai dan email tidak terdaftar (sama dengan API)
  const valid = verifyOtp(email, otp);
  if (!valid) throw new Error(AUTH_MESSAGE.OTP_INVALID);
  // Update password
  const users = getMockUsers();
  const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) throw new Error(AUTH_MESSAGE.OTP_INVALID);
  users[idx].password = newPassword;
  saveMockUsers(users);
  markOtpUsed(email);
  return { message: AUTH_MESSAGE.PASSWORD_CHANGED };
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
 * Step 6.6 (CP2c): login Google hanya tersedia di mode mock (masuk sebagai pelanggan demo). Mode API belum punya
 * endpoint OAuth (SPEC §10: opsional di akhir), jadi tombol menampilkan informasi tanpa mengirim request.
 * @returns {boolean}
 */
export function isGoogleLoginAvailable() {
  return USE_MOCK;
}

/** Step 6.6 (CP2c): petunjuk lokasi kode OTP sesuai mode data (SPEC §10) */
export function getOtpDeliveryHint() {
  return USE_MOCK ? OTP_DELIVERY_HINT.MOCK : OTP_DELIVERY_HINT.API;
}

/**
 * Login dengan Google (mock: masuk sebagai pelanggan demo).
 * Mode API: ditolak tanpa request (GOOGLE_LOGIN_UNAVAILABLE_CODE) — tidak ada POST ke endpoint yang tidak tersedia.
 * @returns {Promise<{user, token}>}
 */
export async function loginWithGoogle() {
  if (!isGoogleLoginAvailable()) {
    throw Object.assign(new Error(GOOGLE_LOGIN_UNAVAILABLE_MESSAGE), { code: GOOGLE_LOGIN_UNAVAILABLE_CODE });
  }
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
