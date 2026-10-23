// utils/apiErrors.js
// Step 6.3 · FR-26 · BR-04 — klasifikasi error REST API (fungsi murni, dipakai services/apiClient & service lain).

/** Kode dari server/src/middlewares/auth.js: token yang dikirim tidak berlaku (kedaluwarsa/rusak/akun nonaktif) */
export const SESSION_INVALID_CODE = 'SESSION_INVALID';

export const SESSION_EXPIRED_MESSAGE = 'Sesi kamu sudah berakhir. Silakan masuk kembali.';

/**
 * true bila sesi lokal harus dihapus: hanya 401 ber-kode SESSION_INVALID untuk request yang memang membawa token.
 * 403 (peran tidak sesuai) dan 401 lain (mis. sandi salah) TIDAK menghapus sesi.
 */
export function isSessionInvalidResponse(status, body, hadToken) {
  return Boolean(hadToken) && status === 401 && body?.code === SESSION_INVALID_CODE;
}

/**
 * Sumber daya tidak ada: 404, atau 400 untuk id yang tidak valid (mis. /produk/abc) — disamakan dengan mode mock
 * yang mengembalikan null untuk keduanya.
 */
export function isMissingResourceError(error) {
  return error?.status === 404 || error?.status === 400;
}
