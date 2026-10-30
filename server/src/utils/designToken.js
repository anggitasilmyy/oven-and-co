// utils/designToken.js
// FR-10 · FR-04 — token akses desain custom cake tamu (HMAC-SHA256, tanpa kolom database baru).
// Desain tamu (user_id kosong) hanya boleh dibaca/dipakai oleh pemegang token yang diberikan saat desain dibuat.
// Kunci: DESIGN_TOKEN_SECRET; bila kosong diturunkan dari JWT_SECRET dengan label terpisah.
// Token & rahasia TIDAK boleh dicetak ke log.

const crypto = require('node:crypto');

const TOKEN_VERSION = 'v1';
const DERIVATION_LABEL = 'oven-and-co:custom-cake-design-token';
// SHA-256 = 32 byte → base64url tanpa padding = 43 karakter
const TOKEN_LENGTH = 43;

function createError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}

function getSigningKey() {
  const dedicated = process.env.DESIGN_TOKEN_SECRET;

  if (dedicated) return dedicated;

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw createError('DESIGN_TOKEN_SECRET atau JWT_SECRET belum dikonfigurasi.');
  }

  // Kunci turunan agar token desain tidak memakai kunci JWT secara langsung
  return crypto.createHmac('sha256', jwtSecret).update(DERIVATION_LABEL).digest();
}

function computeDigest(designId) {
  return crypto
    .createHmac('sha256', getSigningKey())
    .update(`design:${TOKEN_VERSION}:${String(designId)}`)
    .digest();
}

/** Pastikan kunci tersedia sebelum menulis data (gagal lebih awal, bukan setelah desain tersimpan) */
function assertDesignTokenConfigured() {
  getSigningKey();
}

/** @param {bigint|string|number} designId @returns {string} token base64url */
function signDesignToken(designId) {
  return computeDigest(designId).toString('base64url');
}

/** Perbandingan waktu-konstan; false untuk token kosong/format salah */
function verifyDesignToken(designId, token) {
  if (typeof token !== 'string' || token.length !== TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return false;
  }

  const expected = computeDigest(designId);
  const received = Buffer.from(token, 'base64url');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = {
  assertDesignTokenConfigured,
  signDesignToken,
  verifyDesignToken,
};
