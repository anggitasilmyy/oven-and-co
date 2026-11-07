// constants/auth.js
// Step 3 · Authentication
// Sumber: SPEC.md bagian 6 (Validation Rules) & bagian 10 (Asumsi Prototype, TF-15)

/**
 * Key persist Zustand untuk sesi — SUMBER KANONIS sesi ({ state: { user, token }, version }), dibagi semua tab dan
 * disinkronkan lewat event `storage` (services/sessionSync.js). Nilai JANGAN diubah (sesi tersimpan & uji e2e).
 */
export const AUTH_PERSIST_KEY = 'ovenco_auth';

/**
 * Salinan JWT lama (kompatibilitas, hanya DITULIS oleh stores/useAuthStore). Tidak lagi dibaca untuk menentukan
 * token request — token request selalu dari useAuthStore. Nilai JANGAN diubah.
 */
export const AUTH_TOKEN_STORAGE_KEY = 'ovenco_auth_token';

/** Panjang minimal kata sandi (asumsi prototype TF-15) */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Step 6.6 (CP2) · FR-03 — masa berlaku OTP reset sandi (menit), sama dengan server (auth.service
 * requestPasswordReset: expiresAt = sekarang + 10 menit; OTP sah hanya selama expiresAt > sekarang).
 */
export const OTP_VALID_MINUTES = 10;

/** Hitung mundur kirim ulang OTP (detik) — batas tampilan saja, server tidak membatasi kirim ulang */
export const OTP_RESEND_COOLDOWN = 60;

/** Jumlah digit OTP reset sandi (FR-03) */
export const OTP_LENGTH = 6;

/**
 * Tingkat kekuatan kata sandi untuk indikator di C-03.
 * Asumsi: dokumen hanya menyebut "indikator kekuatan" tanpa kriteria rinci.
 */
export const PASSWORD_STRENGTH = {
  WEAK: { level: 1, label: 'Lemah' },
  MEDIUM: { level: 2, label: 'Sedang' },
  STRONG: { level: 3, label: 'Kuat' },
};

/**
 * Step 6.6 (CP2c) · FR-02 · SPEC §10 ("Login Google: tombol tersedia; OAuth asli opsional di akhir").
 * Mode API belum punya endpoint OAuth: tombol tetap tampil, tetapi TIDAK mengirim request — pesan informasi saja.
 */
export const GOOGLE_LOGIN_UNAVAILABLE_MESSAGE =
  'Masuk dengan Google belum tersedia. Silakan masuk dengan email atau nomor HP.';

/** Kode error frontend bila loginWithGoogle dipanggil di mode API (tidak ada request yang dikirim) */
export const GOOGLE_LOGIN_UNAVAILABLE_CODE = 'CLIENT_GOOGLE_LOGIN_UNAVAILABLE';

/**
 * Step 6.6 (CP2c) · FR-03 · SPEC §10 ("OTP dicetak ke console server"): petunjuk lokasi OTP per mode data.
 * Mode mock membuat OTP di browser; mode API mencetaknya di console server (bukan email sungguhan).
 */
export const OTP_DELIVERY_HINT = {
  MOCK: 'Kode OTP ditampilkan di console browser (mode mock).',
  API: 'Pada prototype ini kode OTP ditampilkan di console server.',
};

/**
 * Step 6.6 (CP2d) · SPEC §6 (Registrasi: "HP diawali +62"): nomor HP AKUN (daftar, ubah profil, akun staf) = "+62"
 * diikuti 8–13 digit setelah spasi, tanda kurung, dan "-" dihapus — sama dengan server
 * (auth.service register, profile.validator, adminStaffRules). Nomor penerima alamat & WhatsApp toko memakai aturan
 * server yang berbeda (validatePhone, 9–13 digit total) dan tidak diubah.
 */
export const ACCOUNT_PHONE_PATTERN = /^\+62\d{8,13}$/;
export const ACCOUNT_PHONE_SEPARATORS = /[\s()-]/g;

/**
 * Step 6.6 (CP2d) · SPEC §6 — pesan kegagalan autentikasi mode mock = pesan server (auth.service), sehingga kedua
 * mode tidak membuka apakah email/HP terdaftar atau akun sedang nonaktif.
 */
export const AUTH_MESSAGE = {
  /** Login: akun tidak ada, sandi salah, ATAU akun nonaktif (401) */
  LOGIN_FAILED: 'Email/HP atau kata sandi salah.',
  /** Registrasi: email atau HP sudah dipakai akun lain (409) */
  ALREADY_REGISTERED: 'Email atau nomor HP sudah terdaftar.',
  /** Lupa sandi: selalu sama, terdaftar atau tidak (mode API menyebut console server) */
  OTP_REQUESTED_MOCK: 'Jika email terdaftar, kode OTP reset kata sandi akan ditampilkan di console browser.',
  /** Reset sandi: OTP salah, kedaluwarsa, sudah dipakai, ATAU email tidak terdaftar (400) */
  OTP_INVALID: 'OTP tidak valid, kedaluwarsa, atau sudah digunakan.',
  INVALID_EMAIL: 'Format email tidak valid.',
  PASSWORD_CHANGED: 'Kata sandi berhasil diubah.',
};
